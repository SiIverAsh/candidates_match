import type { ResearchFunctionAssessment } from "../../research-functions/domain/models";

export type ParseStatus = "COMPLETE" | "PARTIAL" | "INSUFFICIENT" | "FAILED";
export type DatePrecision = "DAY" | "MONTH" | "YEAR" | "UNKNOWN";
export type NormalizationConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface NormalizedValue {
  raw: string | null;
  value: string | null;
  alternatives: string[];
  confidence: NormalizationConfidence;
  method: "ALIAS" | "RULE" | "KEYWORD" | "UNRESOLVED";
}

export interface ExperienceDateRange {
  raw: string | null;
  start: string | null;
  end: string | null;
  startPrecision: DatePrecision;
  endPrecision: DatePrecision;
  current: boolean;
}

export interface CandidateWorkExperience {
  sequence: number;
  company: NormalizedValue;
  rawTitle: string | null;
  description?: string;
  normalizedFunction: NormalizedValue;
  dates: ExperienceDateRange;
}

export interface CandidateEducationExperience {
  sequence: number;
  school: NormalizedValue;
  major: NormalizedValue;
  dates: ExperienceDateRange;
}

export interface CandidateCompleteness {
  hasName: boolean;
  hasWorkExperience: boolean;
  hasEducation: boolean;
  hasIncompleteWorkFields: boolean;
  hasIncompleteEducationFields: boolean;
  hasMissingDates: boolean;
}

export interface CandidateProfile {
  queryId: string;
  sourceType: "FILE" | "TEXT";
  sourceFormat: string;
  candidateName: string | null;
  parseStatus: ParseStatus;
  completeness: CandidateCompleteness;
  warnings: string[];
  workExperiences: CandidateWorkExperience[];
  educations: CandidateEducationExperience[];
  researchFunctions?: ResearchFunctionAssessment;
  parserVersion: string;
  normalizerVersion: string;
  parsedAt: string;
  expiresAt: string;
}

export interface ResumeSource {
  queryId: string;
  submittedBy: string;
  sourceType: "FILE" | "TEXT";
  sourceFormat: "plain-text" | "pdf" | "doc" | "docx" | "txt";
  text: string | null;
  bytes: Uint8Array | null;
  expiresAt: string;
}
