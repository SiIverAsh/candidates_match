import type { CANDIDATE_FUNCTION_FILTERS } from "./possible-functions";

export const CANDIDATE_PARSE_STATUSES = ["COMPLETE", "PARTIAL", "INSUFFICIENT", "FAILED", "PENDING"] as const;
export const CANDIDATE_SOURCE_FORMATS = ["pdf", "doc", "docx", "txt", "plain-text"] as const;
export const CANDIDATE_MATCH_STATUSES = ["FOUND", "NO_RESULTS", "INSUFFICIENT", "PENDING"] as const;

export interface CandidateColumnFilters {
  name?: string;
  submittedBy?: string;
  possibleFunctions?: (typeof CANDIDATE_FUNCTION_FILTERS)[number][];
  parseStatuses?: (typeof CANDIDATE_PARSE_STATUSES)[number][];
  sourceFormats?: (typeof CANDIDATE_SOURCE_FORMATS)[number][];
  matchStatuses?: (typeof CANDIDATE_MATCH_STATUSES)[number][];
  submittedFrom?: string;
  submittedTo?: string;
  expiresFrom?: string;
  expiresTo?: string;
}

// Calendar dates in the recruiting UI use Beijing time; the database stores UTC instants.
export function candidateDateBounds(from?: string, to?: string): { start?: string; end?: string } {
  return {
    start: from ? new Date(`${from}T00:00:00+08:00`).toISOString() : undefined,
    end: to ? new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86_400_000).toISOString() : undefined,
  };
}
