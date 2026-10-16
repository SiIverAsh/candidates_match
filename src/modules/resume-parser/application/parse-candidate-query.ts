import type { CandidateProfile } from "../domain/models";
import type { ResumeParserDependencies } from "./ports";

export type ParseCandidateQueryResult =
  | { kind: "profile"; profile: CandidateProfile }
  | { kind: "not_found"; message: string }
  | { kind: "persistence_failed"; message: string };

export async function parseCandidateQuery(
  queryId: string,
  requestedBy: string,
  dependencies: ResumeParserDependencies,
): Promise<ParseCandidateQueryResult> {
  const parsedAt = dependencies.now().toISOString();
  const source = dependencies.repository.findSource(queryId, requestedBy, parsedAt);
  if (!source) return { kind: "not_found", message: "查询不存在、已过期或无权访问。" };

  const extraction = await dependencies.extractor.extract(source);
  const profile = extraction.ok
    ? dependencies.parser.parse(source, extraction.text, parsedAt)
    : dependencies.parser.failed(source, parsedAt, extraction.message);
  try {
    dependencies.repository.saveProfile(profile, requestedBy);
    return { kind: "profile", profile };
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
