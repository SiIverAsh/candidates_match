import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareResumeFile } from "../src/modules/candidate-intake/infrastructure/file/prepare-resume-file";
import { extractResumeText } from "../src/modules/resume-parser/infrastructure/extraction/extract-resume-text";
import { parseResumeText, PARSER_VERSION } from "../src/modules/resume-parser/infrastructure/parsing/parse-resume-text";
import { profileToEmployeeDraft } from "../src/modules/employee-data/domain/profile-to-employee";
import { validateEmployeeResume } from "../src/modules/employee-data/domain/resume-import";
import { employeeResumeDraftSchema } from "../src/modules/employee-data/presentation/contracts";
import type { CandidateProfile, ResumeSource } from "../src/modules/resume-parser/domain/models";

interface AuditResult {
  file: string;
  sourceHash?: string;
  outcome: "rejected" | "unreadable" | "invalid" | "valid" | "exception" | "timeout";
  code?: string;
  message?: string;
  text?: string;
  extractionWarnings?: string[];
  profile?: CandidateProfile;
  issues?: ReturnType<typeof validateEmployeeResume>;
}
interface AuditJob { file: string; cached?: AuditResult }

function inspectText(file: string, source: ResumeSource, text: string, extractionWarnings: string[] = []): AuditResult {
  const now = new Date().toISOString();
  const profile = parseResumeText(source, text, now);
  const draft = profileToEmployeeDraft({ ...profile, warnings: [...new Set([...profile.warnings, ...extractionWarnings])] }, {
    employeeId: `resume-${createHash("sha256").update(text).digest("hex").slice(0, 20)}`,
    email: profile.identity?.email ?? "",
    profileUrl: profile.identity?.profileUrl ?? "",
    sourceText: text,
  });
  const issues = validateEmployeeResume(draft, now.slice(0, 10));
  const contract = employeeResumeDraftSchema.safeParse(draft);
  if (!contract.success) {
    issues.push(...contract.error.issues.map(issue => ({ sheet: "HTTP", row: 0, field: issue.path.join("."), code: "HTTP_CONTRACT", message: issue.message })));
  }
  return { file, outcome: issues.length ? "invalid" : "valid", text, profile, issues };
}

async function inspect({ file, cached }: AuditJob): Promise<AuditResult> {
  const bytes = await readFile(file);
  const sourceHash = createHash("sha256").update(bytes).digest("hex");
  if (cached?.sourceHash === sourceHash) {
    if (!cached.text || !cached.profile) return cached;
    const source: ResumeSource = { queryId: "audit", submittedBy: "audit", sourceType: "FILE", sourceFormat: cached.profile.sourceFormat as ResumeSource["sourceFormat"], text: null, bytes: null, expiresAt: new Date().toISOString() };
    const result = inspectText(file, source, cached.text, cached.extractionWarnings);
    result.sourceHash = sourceHash;
    result.extractionWarnings = cached.extractionWarnings;
    return result;
  }
  const prepared = await prepareResumeFile({ name: path.basename(file), type: "", size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer });
  if (!prepared.ok) return { file, sourceHash, outcome: "rejected", code: prepared.code, message: prepared.message };
  const now = new Date().toISOString();
  const source = { bytes: null, ...prepared.payload, queryId: "audit", submittedBy: "audit", text: null, expiresAt: now };
  const extracted = await extractResumeText(source);
  if (!extracted.ok) return { file, sourceHash, outcome: "unreadable", code: extracted.code, message: extracted.message };
  return { ...inspectText(file, source, extracted.text, extracted.warnings), sourceHash, extractionWarnings: extracted.warnings };
}

if (process.argv.includes("--worker")) {
  process.on("message", async (job: AuditJob) => {
    try { process.send?.(await inspect(job)); }
    catch { process.send?.({ file: job.file, outcome: "exception" }); }
  });
} else {
  const directory = path.resolve(process.argv[2] ?? "profile");
  const output = path.resolve(process.argv[3] ?? "outputs/resume-audit");
  const cachedDirectory = process.argv.find(arg => arg.startsWith("--reparse-from="))?.slice("--reparse-from=".length);
  await mkdir(output, { recursive: true, mode: 0o700 });
  async function list(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? list(path.join(dir, entry.name)) : entry.isFile() ? [path.join(dir, entry.name)] : []))).flat();
  }
  const files = (await list(directory)).sort();
  const counts: Record<string, number> = {};
  const fieldCounts = { name: 0, work: 0, education: 0, research: 0, both: 0 };
  const recordCounts = { work: 0, education: 0, research: 0, completeWorkFields: 0, completeEducationFields: 0 };
  const byExtension: Record<string, Record<string, number>> = {};
  const validationIssues: Record<string, number> = {};
  const extractionWarnings: Record<string, number> = {};
  const missingFields = { workTitle: 0, workStart: 0, workEnd: 0, educationMajor: 0, educationDegree: 0, educationStart: 0, educationEnd: 0 };
  const manifest: { key: string; file: string; outcome: string; code?: string }[] = [];
  let next = 0;
  let done = 0;
  await Promise.all(Array.from({ length: 4 }, async () => {
    let child = fork(fileURLToPath(import.meta.url), ["--worker"], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
    while (next < files.length) {
      const file = files[next++];
      const key = createHash("sha256").update(path.relative(directory, file)).digest("hex").slice(0, 16);
      const cached: AuditResult | undefined = cachedDirectory ? JSON.parse(await readFile(path.join(cachedDirectory, `${key}.json`), "utf8")) : undefined;
      let restart = false;
      const result = await new Promise<AuditResult>(resolve => {
        const timeout = setTimeout(() => { cleanup(); restart = true; child.kill(); resolve({ file, outcome: "timeout" }); }, 120_000);
        const cleanup = () => { clearTimeout(timeout); child.removeAllListeners("message"); child.removeAllListeners("exit"); };
        child.once("message", result => { cleanup(); resolve(result as AuditResult); });
        child.once("exit", () => { cleanup(); restart = true; resolve({ file, outcome: "exception" }); });
        child.send({ file, cached } satisfies AuditJob);
      });
      if (restart || !child.connected) child = fork(fileURLToPath(import.meta.url), ["--worker"], { stdio: ["ignore", "ignore", "ignore", "ipc"] });
      await writeFile(path.join(output, `${key}.json`), JSON.stringify(result), { mode: 0o600 });
      manifest.push({ key, file, outcome: result.outcome, code: result.code });
      counts[result.outcome] = (counts[result.outcome] ?? 0) + 1;
      const extensionCounts = byExtension[path.extname(file).toLowerCase()] ??= {};
      extensionCounts[result.outcome] = (extensionCounts[result.outcome] ?? 0) + 1;
      for (const issue of result.issues ?? []) validationIssues[issue.message] = (validationIssues[issue.message] ?? 0) + 1;
      for (const warning of result.extractionWarnings ?? []) extractionWarnings[warning] = (extractionWarnings[warning] ?? 0) + 1;
      for (const work of result.profile?.workExperiences ?? []) {
        recordCounts.work++;
        if (work.company.raw && work.rawTitle && work.dates.start && (work.dates.end || work.dates.current)) recordCounts.completeWorkFields++;
        if (!work.rawTitle) missingFields.workTitle++;
        if (!work.dates.start) missingFields.workStart++;
        if (!work.dates.end && !work.dates.current) missingFields.workEnd++;
      }
      for (const education of result.profile?.educations ?? []) {
        recordCounts.education++;
        if (education.school.raw && education.major.raw && education.degree && education.dates.start && (education.dates.end || education.dates.current)) recordCounts.completeEducationFields++;
        if (!education.major.raw) missingFields.educationMajor++;
        if (!education.degree) missingFields.educationDegree++;
        if (!education.dates.start) missingFields.educationStart++;
        if (!education.dates.end && !education.dates.current) missingFields.educationEnd++;
      }
      const c = result.profile?.completeness;
      const research = result.profile?.researchExperiences ?? [];
      recordCounts.research += research.length;
      if (research.length) fieldCounts.research++;
      if (c?.hasName) fieldCounts.name++;
      if (c?.hasWorkExperience) fieldCounts.work++;
      if (c?.hasEducation) fieldCounts.education++;
      if (c?.hasWorkExperience && c?.hasEducation) fieldCounts.both++;
      if (++done % 100 === 0) console.log(JSON.stringify({ done, total: files.length, counts }));
    }
    child.kill();
  }));
  const summary = { parserVersion: PARSER_VERSION, mode: cachedDirectory ? "reparse-cached-text" : "full-extraction", total: files.length, counts, fieldCounts, recordCounts, byExtension, validationIssues, missingFields, extractionWarnings, note: "Counts measure extraction and validation coverage, not correctness. Missing fields may be absent in the original; manual ground truth is required." };
  await writeFile(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  await writeFile(path.join(output, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
}
