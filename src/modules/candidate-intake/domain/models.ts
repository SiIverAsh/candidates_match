export type CandidateSourceType = "FILE" | "TEXT";

export type CandidateQueryStatus = "QUEUED_FOR_PARSING";

export interface CandidateQuery {
  id: string;
  submittedBy: string;
  submittedAt: string;
  employeeVersionId: string | null;
  sourceType: CandidateSourceType;
  sourceFormat: string;
  status: CandidateQueryStatus;
  expiresAt: string;
}

export type CandidateSourcePayload =
  | { sourceType: "TEXT"; sourceFormat: "plain-text"; text: string }
  | {
      sourceType: "FILE";
      sourceFormat: "pdf" | "docx" | "txt";
      mimeType: string;
      bytes: Uint8Array;
    };

export interface CandidateReadiness {
  ready: boolean;
  activeVersion: {
    id: string;
    importedAt: string;
    employeeCount: number;
  } | null;
}

export interface CandidateQuerySummary extends CandidateQuery {
  candidateName: string | null;
  parseStatus: "COMPLETE" | "PARTIAL" | "INSUFFICIENT" | "FAILED" | null;
  matching: {
    status: "COMPLETED" | "NO_RESULTS" | "SKIPPED_INSUFFICIENT";
    resultCount: number;
    createdAt: string;
  } | null;
}

export interface CandidateQueryPage {
  items: CandidateQuerySummary[];
  total: number;
  page: number;
  pageSize: number;
}
