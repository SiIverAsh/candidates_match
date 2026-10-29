import type { CandidateProfile } from "../domain/models";
import type { ResumeParserDependencies } from "./ports";

function addResearchFunctions(profile: CandidateProfile, dependencies: ResumeParserDependencies): CandidateProfile {
  if (!dependencies.functionClassifier) return profile;
  const assessment = dependencies.functionClassifier.classify(profile.workExperiences.map(work => ({
    sequence: work.sequence, company: work.company.raw, title: work.rawTitle,
    description: work.description ?? "", start: work.dates.start, end: work.dates.end, current: work.dates.current,
  })));
  if (profile.parseStatus === "FAILED") assessment.summary = `${profile.warnings.join(" ")} 无法从简历正文确定职能。`;
  return { ...profile, researchFunctions: assessment };
}

export type ParseCandidateQueryResult =
  | { kind: "profile"; profile: CandidateProfile }
  | { kind: "not_found"; message: string }
  | { kind: "persistence_failed"; message: string };

export async function parseCandidateQuery(
  queryId: string,
  requestedBy: string,
  dependencies: ResumeParserDependencies,
  reuseExisting = false,
): Promise<ParseCandidateQueryResult> {
  const parsedAt = dependencies.now().toISOString();
  const source = dependencies.repository.findSource(queryId, requestedBy, parsedAt);
  if (!source) return { kind: "not_found", message: "查询不存在、已过期或无权访问。" };

  const extraction = await dependencies.extractor.extract(source);
  const parsedProfile = extraction.ok
    ? dependencies.parser.parse(source, extraction.text, parsedAt)
    : dependencies.parser.failed(source, parsedAt, extraction.message);
  if (extraction.ok && extraction.warnings?.length) {
    parsedProfile.warnings = [...new Set([...parsedProfile.warnings, ...extraction.warnings])];
  }
  const profile = addResearchFunctions(parsedProfile, dependencies);
  try {
    const saved = dependencies.repository.saveProfile(profile, requestedBy, reuseExisting);
    return { kind: "profile", profile: saved };
  } catch {
    return { kind: "persistence_failed", message: "解析结果暂时无法保存，请稍后重试。" };
  }
}

export function getCandidateProfile(
  queryId: string,
  requestedBy: string,
  dependencies: Pick<ResumeParserDependencies, "repository" | "now">,
): CandidateProfile | null {
  return dependencies.repository.findProfile(queryId, requestedBy, dependencies.now().toISOString());
}

export async function ensureCandidateProfile(
  queryId: string,
  requestedBy: string,
  dependencies: ResumeParserDependencies,
): Promise<ParseCandidateQueryResult> {
  const profile = getCandidateProfile(queryId, requestedBy, dependencies);
  if (profile && profile.parseStatus !== "FAILED") {
    const enriched = await ensureCandidateResearchFunctions(queryId, requestedBy, dependencies);
    return enriched ? { kind: "profile", profile: enriched } : { kind: "not_found", message: "候选人资料已过期或不可用。" };
  }
  return parseCandidateQuery(queryId, requestedBy, dependencies, true);
}

export async function ensureCandidateResearchFunctions(
  queryId: string,
  requestedBy: string,
  dependencies: ResumeParserDependencies,
): Promise<CandidateProfile | null> {
  const now = dependencies.now().toISOString();
  const existing = dependencies.repository.findProfile(queryId, requestedBy, now);
  if (existing?.identity && (existing.researchFunctions || !dependencies.functionClassifier)) return existing;
  if (!existing) {
    const result = await parseCandidateQuery(queryId, requestedBy, dependencies, true);
    if (result.kind === "persistence_failed") throw new Error("FUNCTION_ASSESSMENT_SAVE_FAILED");
    if (result.kind === "not_found") return null;
    // Another request may have saved a legacy profile while extraction was running.
    return result.profile.identity && (result.profile.researchFunctions || !dependencies.functionClassifier)
      ? result.profile : ensureCandidateResearchFunctions(queryId, requestedBy, dependencies);
  }

  const source = dependencies.repository.findSource(queryId, requestedBy, now);
  if (!source) return null;
  // Legacy profiles did not retain responsibilities. Read the candidate's own source
  // again for classification, without replacing their profile or relationship matches.
  const extraction = await dependencies.extractor.extract(source);
  const parsed = extraction.ok ? dependencies.parser.parse(source, extraction.text, now)
    : dependencies.parser.failed(source, now, extraction.message);
  const identified = existing.identity ? existing : dependencies.repository.saveIdentity(queryId, parsed.identity ?? {}, requestedBy, now);
  if (!identified || identified.researchFunctions || !dependencies.functionClassifier) return identified;
  const enriched = addResearchFunctions(parsed, dependencies);
  return dependencies.repository.saveFunctionAssessment(queryId, enriched.researchFunctions!, requestedBy, dependencies.now().toISOString());
}

export function createResearchFunctionReader(dependencies: ResumeParserDependencies) {
  const pending = new Map<string, Promise<CandidateProfile | null>>();
  let pendingAll: Promise<void> | null = null;
  function ensure(queryId: string, requestedBy: string): Promise<CandidateProfile | null> {
    const existing = pending.get(queryId);
    if (existing) return existing;
    const task = ensureCandidateResearchFunctions(queryId, requestedBy, dependencies)
      .finally(() => { pending.delete(queryId); });
    pending.set(queryId, task);
    return task;
  }
  function ensureAll(requestedBy: string): Promise<void> {
    if (pendingAll) return pendingAll;
    pendingAll = (async () => {
      for (const queryId of dependencies.repository.findMissingFunctionQueryIds(dependencies.now().toISOString())) {
        await ensure(queryId, requestedBy);
      }
    })().finally(() => { pendingAll = null; });
    return pendingAll;
  }
  return { ensure, ensureAll };
}
