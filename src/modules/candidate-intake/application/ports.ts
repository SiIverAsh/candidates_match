import type {
  CandidateQuery,
  CandidateReadiness,
  CandidateSourcePayload,
  CandidateQueryPage,
  CandidateMatchCategory,
} from "../domain/models";
import type { CandidateColumnFilters } from "../domain/column-filters";

export interface CandidateActor {
  id: string;
  displayName: string;
}

export interface CandidateLibraryRepository {
  // Records are shared by the authenticated recruiting workspace, not scoped to their submitter.
  list(requestedBy: string, now: string, page: number, search: string, resultsOnly: boolean, matchCategory?: CandidateMatchCategory, filters?: CandidateColumnFilters): CandidateQueryPage;
  find(queryId: string, requestedBy: string, now: string): CandidateQuery | null;
}

export interface CandidateFileInput {
  name: string;
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export type CandidateFilePreparationResult =
  | { ok: true; payload: CandidateSourcePayload }
  | { ok: false; code: string; message: string };

export interface CandidateFilePreparer {
  prepare(file: CandidateFileInput): Promise<CandidateFilePreparationResult>;
}

export interface CandidateSubmissionRepository {
  purgeExpired(now: string): number;
  // Reuse identical live sources across all recruiters and retain the original submission metadata.
  createOrReuse(query: CandidateQuery, payload: CandidateSourcePayload, actor: CandidateActor): { query: CandidateQuery; reused: boolean };
}

export interface EmployeeVersionReader {
  readiness(): CandidateReadiness;
}

export interface CandidateIntakeDependencies {
  files: CandidateFilePreparer;
  repository: CandidateSubmissionRepository;
  employeeVersions: EmployeeVersionReader;
  now(): Date;
  createId(): string;
}
