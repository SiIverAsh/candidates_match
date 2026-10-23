import type { ResearchFunctionAssessment } from "../../research-functions/domain/models";

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

export interface WorkFunctionComparison {
  company: string;
  candidateTitle: string | null;
  employeeTitle: string;
  candidateFunction: string | null;
  employeeFunction: string | null;
  status: "SAME_CATEGORY" | "DIFFERENT_CATEGORY" | "UNKNOWN";
  overlap: EvidenceOverlap | null;
  bonus: number;
  reason: string;
  candidateSourceFields: string[];
  employeeSourceFields: string[];
}

export interface FunctionSimilarity {
  status: WorkFunctionComparison["status"];
  bonus: number;
  comparisons: WorkFunctionComparison[];
}

export interface EmployeeMatchResult {
  employeeId: string;
  name: string;
  email: string;
  currentDepartment: string;
  currentTitle: string;
  rank: number;
  score: number;
  // Optional for persisted results produced before matching-rules-v2.
  relationshipScore?: number;
  functionSimilarity?: FunctionSimilarity;
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
  candidateFunctions?: ResearchFunctionAssessment;
  ruleVersion: string;
  thresholdVersion: string;
  normalizerVersion: string;
  submittedAt: string;
  createdAt: string;
  expiresAt: string;
}
