import type { CandidateLibraryRepository } from "./ports";

export function listCandidates(
  requestedBy: string,
  input: { page?: number; search?: string; resultsOnly?: boolean },
  repository: CandidateLibraryRepository,
  now: string,
) {
  const page = Number.isSafeInteger(input.page) && input.page! > 0 ? Math.min(input.page!, 100_000) : 1;
  return repository.list(requestedBy, now, page, (input.search ?? "").trim().slice(0, 100), Boolean(input.resultsOnly));
}

export function getCandidateQuery(queryId: string, requestedBy: string, repository: CandidateLibraryRepository, now: string) {
  return repository.find(queryId, requestedBy, now);
}
