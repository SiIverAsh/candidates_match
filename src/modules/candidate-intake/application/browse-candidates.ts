import type { CandidateLibraryRepository } from "./ports";
import type { CandidateColumnFilters } from "../domain/column-filters";

export interface CandidateListInput {
  page?: number;
  search?: string;
  resultsOnly?: boolean;
  matchCategory?: string;
  filters?: CandidateColumnFilters;
}

export async function browseCandidates(
  requestedBy: string,
  input: CandidateListInput,
  dependencies: { repository: CandidateLibraryRepository; ensureFunctions(requestedBy: string): Promise<void>; now(): string },
) {
  // Prepare before filtering/counting so legacy candidates participate in every page.
  await dependencies.ensureFunctions(requestedBy);
  return listCandidates(requestedBy, input, dependencies.repository, dependencies.now());
}

export function listCandidates(
  requestedBy: string,
  input: CandidateListInput,
  repository: CandidateLibraryRepository,
  now: string,
) {
  const page = Number.isSafeInteger(input.page) && input.page! > 0 ? Math.min(input.page!, 100_000) : 1;
  const matchCategory = input.resultsOnly && (input.matchCategory === "FOUND" || input.matchCategory === "NOT_FOUND") ? input.matchCategory : undefined;
  return repository.list(requestedBy, now, page, (input.search ?? "").trim().slice(0, 100), Boolean(input.resultsOnly), matchCategory, {
    ...input.filters,
    name: input.filters?.name?.trim().slice(0, 100) || undefined,
    submittedBy: input.filters?.submittedBy?.trim().slice(0, 100) || undefined,
  });
}

export function getCandidateQuery(queryId: string, requestedBy: string, repository: CandidateLibraryRepository, now: string) {
  return repository.find(queryId, requestedBy, now);
}
