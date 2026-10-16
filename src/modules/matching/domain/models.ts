export type MatchConfidence = "HIGH" | "MEDIUM" | "LOW";
export type MatchRunStatus = "COMPLETED" | "NO_RESULTS" | "SKIPPED_INSUFFICIENT";
export type EvidenceStrength = "STRONG" | "MEDIUM" | "WEAK";
export type MatchEvidenceType =
  | "EDUCATION_SCHOOL_MAJOR_OVERLAP"
  | "EDUCATION_SCHOOL_OVERLAP"
  | "EDUCATION_SAME_SCHOOL"
  | "WORK_COMPANY_FUNCTION_OVERLAP"
  | "WORK_COMPANY_OVERLAP"
  | "WORK_SAME_COMPANY";

export interface EvidenceOverlap {
  start: string;
  end: string;
  precision: "DAY" | "MONTH" | "YEAR";
  months: number | null;
}

export interface MatchEvidence {
  id: string;
  type: MatchEvidenceType;
  strength: EvidenceStrength;
  score: number;
  candidateSourceFields: string[];
  employeeSourceFields: string[];
  normalizedValues: Record<string, string>;
  overlap: EvidenceOverlap | null;
  reason: string;
}

export interface EmployeeMatchResult {
  employeeId: string;
  name: string;
  email: string;
  currentDepartment: string;
  currentTitle: string;
  rank: number;
  score: number;
  confidence: MatchConfidence;
  evidence: MatchEvidence[];
}

export interface MatchRun {
  id: string;
  queryId: string;
  employeeVersionId: string;
  status: MatchRunStatus;
  resultCount: number;
  results: EmployeeMatchResult[];
  ruleVersion: string;
  thresholdVersion: string;
  normalizerVersion: string;
  submittedAt: string;
  createdAt: string;
  expiresAt: string;
}
