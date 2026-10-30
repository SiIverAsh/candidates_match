import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CandidateProfile } from "../src/modules/resume-parser/domain/models";
import { profileToEmployeeDraft } from "../src/modules/employee-data/domain/profile-to-employee";
import { readWorkbook } from "../src/shared/infrastructure/excel/read-workbook";
import { normalizePersonEmail } from "../src/shared/domain/person-identity";
import { normalizeCompany, normalizeFunction } from "../src/modules/resume-parser/domain/normalization";
import { parseDateRange } from "../src/modules/resume-parser/domain/dates";

type AuditOutcome = "valid" | "invalid" | "rejected" | "unreadable" | "exception" | "timeout";
interface AuditManifestEntry { key: string; file: string; outcome: AuditOutcome; code?: string }
interface AuditResult {
  file: string;
  sourceHash?: string;
  outcome: AuditOutcome;
  code?: string;
  message?: string;
  extractionWarnings?: string[];
  text?: string;
  profile?: CandidateProfile;
  issues?: { sheet: string; row: number; field: string; code: string; message: string }[];
}

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = await Promise.all(entries.map(entry => entry.isDirectory()
    ? listFiles(path.join(dir, entry.name))
    : entry.isFile() ? [path.resolve(dir, entry.name)] : []));
  return found.flat();
}

interface SingleWorkbookCandidate { name: string; nameCell: string; email: string | null; emailCell: string | null; workText: string; cell: string }
interface PriorAudit { sourceHash: string; parserVersion: string | null; status: boolean | null; issues: string[]; uncertain: string[]; method: string }

async function loadPriorAudits(): Promise<Map<string, PriorAudit>> {
  const result = new Map<string, PriorAudit>();
  for (const group of [1, 2, 3]) {
    try {
      const content = JSON.parse(await readFile(`outputs/resume-field-audit-sample/results-${group}.json`, "utf8"));
      const items = content.items ?? content.results ?? content.cases ?? [];
      for (const item of items) {
        if (!/^[0-9a-f]{16}$/u.test(item.key)) continue;
        const source = JSON.parse(await readFile(`outputs/resume-read-error-audit/${item.key}.json`, "utf8"));
        if (!source.sourceHash) continue;
        const detail = item.results ?? {};
        const status = item.fully_correct ?? item.whole_correct ?? detail.overall_correct ?? null;
        const issues = item.issues ?? item.errors ?? detail.errors ?? [];
        const uncertain = item.uncertain ?? detail.uncertain ?? [];
        result.set(item.key, { sourceHash: source.sourceHash, parserVersion: source.profile?.parserVersion ?? null, status, issues, uncertain, method: item.method ?? "" });
      }
    } catch { /* Previous local sample review is optional. */ }
  }
  return result;
}

async function singleWorkbookCandidate(bytes: Buffer): Promise<SingleWorkbookCandidate | null> {
  // This only recognizes a compact, explicit single-person form. It never tries
  // to turn a large or ambiguous workbook into a single employee.
  if (bytes.byteLength > 1024 * 1024) return null;
  try {
    const workbook = await readWorkbook(Uint8Array.from(bytes).buffer, 20 * 1024 * 1024);
    const sheets = workbook.worksheets.filter(sheet => sheet.actualRowCount > 0);
    if (sheets.length !== 1 || sheets[0].rowCount > 20 || sheets[0].columnCount > 15) return null;
    const matches: Record<string, { text: string; cell: string }[]> = { 姓名: [], 邮箱: [], 工作简历: [] };
    sheets[0].eachRow(row => row.eachCell(cell => {
      if (cell.isMerged && cell.master.address !== cell.address) return;
      const label = cell.text.trim();
      if (!(label in matches)) return;
      const value = row.getCell(cell.col + 1);
      const text = value.text.trim();
      if (text) matches[label].push({ text, cell: value.address });
    }));
    if (matches.姓名.length !== 1 || matches.工作简历.length !== 1 || matches.邮箱.length > 1) return null;
    const name = matches.姓名[0].text;
    const work = matches.工作简历[0];
    if (!name || name.length > 60 || work.text.length < 40) return null;
    return { name, nameCell: matches.姓名[0].cell, email: normalizePersonEmail(matches.邮箱[0]?.text) ?? null, emailCell: matches.邮箱[0]?.cell ?? null, workText: work.text, cell: work.cell };
  } catch { return null; }
}

function workbookWorkCandidates(candidate: SingleWorkbookCandidate) {
  const records = [];
  for (const section of candidate.workText.split(/[●•\n]/u).map(value => value.trim()).filter(Boolean)) {
    // Require an explicit time range, location verb and a company/group suffix.
    const match = section.match(/^((?:19|20)\d{2}年(?:\d{1,2}[月份])?\s*(?:-|—|–|~|至|到)\s*(?:(?:19|20)\d{2}年(?:\d{1,2}[月份])?|\d{1,2}[月份]|至今|今))\s*(?:应聘)?在\s*([^，,。；;]{2,60}?(?:有限责任公司|股份有限公司|有限公司|集团|公司))(?=\s*(?:[，,。；;]|负责|从事|工作|还是|$))/u);
    if (!match) continue;
    records.push({
      sequence: records.length + 1, company: normalizeCompany(match[2]), title: null, description: section,
      normalizedFunction: normalizeFunction(null), dates: parseDateRange(match[1]), includedInEmployeeDraft: false,
      evidence: { page: null, textOffset: null, cell: candidate.cell },
    });
  }
  return records;
}

function convert(entry: AuditManifestEntry, data: AuditResult, sourceRoot: string, workbookCandidate: SingleWorkbookCandidate | null, priorAudit: PriorAudit | undefined) {
  const profile = data.profile;
  // A previous job is not necessarily current. Multiple current jobs or a
  // current row missing company/title are ambiguous; never choose one by sort.
  const current = profile?.workExperiences.filter(item => item.dates.current) ?? [];
  const currentTitle = current.length === 1 && current[0].company.raw && current[0].rawTitle ? current[0].rawTitle : null;
  const derived = profile ? profileToEmployeeDraft(profile, { email: profile.identity?.email ?? "" }) : null;
  const baseWarnings = [...new Set([...(profile?.warnings ?? []), ...(data.extractionWarnings ?? []), ...(derived?.warnings ?? [])])];
  if (profile && !currentTitle) baseWarnings.push("未能根据唯一当前任职确定当前职位，留空待核对。");
  return {
    schemaVersion: "2",
    recordId: entry.key,
    reviewStatus: "未复核",
    source: {
      relativePath: path.relative(sourceRoot, data.file).split(path.sep).join("/"),
      sha256: data.sourceHash!,
      format: profile?.sourceFormat ?? path.extname(data.file).slice(1).toLowerCase(),
      page: null,
      fieldEvidence: workbookCandidate ? { nameCell: workbookCandidate.nameCell, emailCell: workbookCandidate.emailCell } : null,
      unstructuredSections: workbookCandidate ? [{ label: "工作简历", cell: workbookCandidate.cell, text: workbookCandidate.workText }] : [],
    },
    outcome: data.outcome,
    error: path.extname(data.file).toLowerCase() === ".xlsx"
      ? { code: "WORKBOOK_REQUIRES_REVIEW", message: workbookCandidate ? "单人表格仅部分提取，请对照原表逐项核验；不可直接导入。" : "Excel 表格结构尚未确认，请先单独核验，不能自动当作单人简历。" }
      : data.code || data.message ? { code: data.code ?? null, message: data.message ?? null } : null,
    parserVersion: profile?.parserVersion ?? null,
    normalizerVersion: profile?.normalizerVersion ?? null,
    parseStatus: profile?.parseStatus ?? null,
    person: {
      name: profile?.candidateName ?? workbookCandidate?.name ?? null,
      email: profile?.identity?.email ?? workbookCandidate?.email ?? null,
      profileUrl: profile?.identity?.profileUrl ?? null,
      resumeFingerprint: profile?.identity?.resumeFingerprint ?? null,
      currentTitle,
      currentDepartment: null,
    },
    workExperiences: workbookCandidate ? workbookWorkCandidates(workbookCandidate) : (profile?.workExperiences ?? []).map(item => ({
      sequence: item.sequence,
      company: item.company,
      title: item.rawTitle?.trim() || null,
      description: item.description || null,
      normalizedFunction: item.normalizedFunction,
      dates: item.dates,
      includedInEmployeeDraft: Boolean(item.company.raw),
      evidence: { page: null, textOffset: null },
    })),
    researchExperiences: (profile?.researchExperiences ?? []).map(item => ({
      sequence: item.sequence,
      heading: item.heading,
      description: item.description,
      evidence: { page: null, textOffset: null },
    })),
    educations: (profile?.educations ?? []).map(item => ({
      sequence: item.sequence,
      school: item.school,
      major: item.major,
      degree: item.degree ?? null,
      dates: item.dates,
      includedInEmployeeDraft: Boolean(item.school.raw),
      evidence: { page: null, textOffset: null },
    })),
    warnings: workbookCandidate ? [...baseWarnings, "单人表格仅部分提取；公司、日期及未识别经历需对照工作简历原文逐项核验，不能直接导入。"] : baseWarnings,
    validationIssues: data.issues ?? [],
    completeness: profile?.completeness ?? null,
    priorAudit: priorAudit && priorAudit.sourceHash === data.sourceHash ? {
      scope: "此前仅抽检旧版解析的部分字段，不代表本次解析已核对或已纠正。",
      parserVersion: priorAudit.parserVersion,
      checkedFieldsConsistent: priorAudit.status,
      issues: priorAudit.issues,
      uncertain: priorAudit.uncertain,
      method: priorAudit.method,
      report: "outputs/resume-field-audit-sample/report.md",
    } : null,
  };
}

async function main() {
  const sourceRoot = path.resolve(process.argv[2] ?? "profile");
  const auditRoot = path.resolve(process.argv[3] ?? "outputs/resume-standardization-audit");
  const outputRoot = path.resolve(process.argv[4] ?? "outputs/standardized-profile");
  const manifest = JSON.parse(await readFile(path.join(auditRoot, "manifest.json"), "utf8")) as AuditManifestEntry[];
  const summary = JSON.parse(await readFile(path.join(auditRoot, "summary.json"), "utf8")) as { total: number; parserVersion: string };
  const actualFiles = await listFiles(sourceRoot);
  const sourceSet = new Set(actualFiles);
  if (manifest.length !== summary.total || sourceSet.size !== manifest.length || new Set(manifest.map(x => x.key)).size !== manifest.length) {
    throw new Error("简历文件清单已变化，请先重新运行完整审计。");
  }
  const sorted = [...manifest].sort((a, b) => a.file.localeCompare(b.file, "zh-CN"));
  const previousAudits = await loadPriorAudits();
  const records = [];
  const outcomes: Record<string, number> = {};
  let profiles = 0, workbookCandidates = 0, priorAuditRecords = 0, workRecords = 0, educationRecords = 0, researchRecords = 0, researchProfiles = 0, retainedWorkWithoutCompany = 0, retainedEducationWithoutSchool = 0, workNotInEmployeeDraft = 0;
  for (const entry of sorted) {
    const file = path.resolve(entry.file);
    const relative = path.relative(sourceRoot, file);
    if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative) || !sourceSet.delete(file)) {
      throw new Error("审计清单与简历目录不一致，请重新运行完整审计。");
    }
    if (!/^[0-9a-f]{16}$/u.test(entry.key)) throw new Error("审计记录编号无效。");
    const result = JSON.parse(await readFile(path.join(auditRoot, `${entry.key}.json`), "utf8")) as AuditResult;
    const bytes = await readFile(file);
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (path.resolve(result.file) !== file || !result.sourceHash || result.sourceHash !== hash || result.outcome !== entry.outcome) {
      throw new Error("文件或审计记录已变化，请先重新运行完整审计。");
    }
    const workbookCandidate = path.extname(file).toLowerCase() === ".xlsx" ? await singleWorkbookCandidate(bytes) : null;
    const record = convert(entry, result, sourceRoot, workbookCandidate, previousAudits.get(entry.key));
    outcomes[record.outcome] = (outcomes[record.outcome] ?? 0) + 1;
    if (result.profile) profiles++;
    if (workbookCandidate) workbookCandidates++;
    if (record.priorAudit) priorAuditRecords++;
    workRecords += record.workExperiences.length;
    educationRecords += record.educations.length;
    researchRecords += record.researchExperiences.length;
    if (record.researchExperiences.length) researchProfiles++;
    retainedWorkWithoutCompany += record.workExperiences.filter(x => !x.company.raw).length;
    retainedEducationWithoutSchool += record.educations.filter(x => !x.school.raw).length;
    workNotInEmployeeDraft += record.workExperiences.filter(x => !x.includedInEmployeeDraft).length;
    records.push(record);
  }
  if (sourceSet.size) throw new Error("简历目录新增了文件，请重新运行完整审计。");
  // Refuse to overwrite an existing export, including a user's reviewed copy.
  await mkdir(outputRoot, { mode: 0o700 });
  await writeFile(path.join(outputRoot, "records.jsonl"), records.map(record => JSON.stringify(record)).join("\n") + "\n", { mode: 0o600, flag: "wx" });
  const exportSummary = {
    schemaVersion: "2", sourceDirectory: sourceRoot, generatedAt: new Date().toISOString(),
    auditParserVersion: summary.parserVersion, total: records.length, outcomes, profiles, workbookCandidates, priorAuditRecords, workRecords, educationRecords, researchRecords, researchProfiles,
    retainedWorkWithoutCompany, retainedEducationWithoutSchool, workNotInEmployeeDraft, reviewStatus: "全部未全面复核",
    note: "自动提取及规范化候选，非人工真值。研究经历按独立研究章节全文保存，不强猜项目机构或职位；章节数不等于项目数。原字段、日期精度、待核对项及缺机构经历均保留；页码/文本偏移未提取，不作为已验证证据。",
  };
  await writeFile(path.join(outputRoot, "summary.json"), JSON.stringify(exportSummary, null, 2), { mode: 0o600, flag: "wx" });
  console.log(JSON.stringify({ total: records.length, outcomes, profiles, workbookCandidates, priorAuditRecords, workRecords, educationRecords, researchRecords, researchProfiles, retainedWorkWithoutCompany, retainedEducationWithoutSchool, workNotInEmployeeDraft }));
}

await main();
