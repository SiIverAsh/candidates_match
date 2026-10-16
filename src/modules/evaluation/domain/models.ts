import type { EmployeeSnapshot } from "../../matching/application/ports";
import type { CandidateProfile } from "../../resume-parser";

export const RELATIONSHIP_SCENARIOS = [
  "SAME_COMPANY_OVERLAP",
  "SAME_COMPANY_FUNCTION_OVERLAP",
  "SAME_SCHOOL_OVERLAP",
  "SAME_SCHOOL_MAJOR_OVERLAP",
  "OTHER_VERIFIED_RELATIONSHIP",
] as const;

export type RelationshipScenario = typeof RELATIONSHIP_SCENARIOS[number];

export interface EvaluationVersions {
  employeeVersionId: string;
  parserVersion: string;
  ruleVersion: string;
  thresholdVersion: string;
  normalizerVersion: string;
  labelPolicyVersion: string;
}

export interface EvaluationCase {
  id: string;
  submittedAt: string;
  relationshipScenario: RelationshipScenario;
  profile: CandidateProfile;
  knownRelationshipEmployeeIds: string[];
}

export interface PrototypeValidation {
  participantCount: number;
  successfulParticipantCount: number;
}

export interface EvaluationDataset {
  schemaVersion: "evaluation-dataset-v1";
  datasetId: string;
  datasetVersion: string;
  versions: EvaluationVersions;
  employees: EmployeeSnapshot[];
  cases: EvaluationCase[];
  prototypeValidation?: PrototypeValidation;
}

export interface RateMetric {
  numerator: number;
  denominator: number;
  rate: number | null;
}

export interface ScenarioMetrics {
  scenario: RelationshipScenario;
  caseCount: number;
  top5: RateMetric;
  highConfidencePrecision: RateMetric;
}

export type EvaluationErrorKind =
  | "KNOWN_RELATION_NOT_RECOMMENDED"
  | "KNOWN_RELATION_OUTSIDE_TOP5"
  | "HIGH_CONFIDENCE_FALSE_POSITIVE";

export interface EvaluationErrorCase {
  kind: EvaluationErrorKind;
  caseId: string;
  scenario: RelationshipScenario;
  employeeId: string;
  rank: number | null;
  score: number | null;
  confidence: "HIGH" | "MEDIUM" | "LOW" | null;
  evidenceTypes: string[];
}

export interface EvaluationGate {
  name: "MINIMUM_SAMPLE_SIZE" | "TOP5_HIT_RATE" | "HIGH_CONFIDENCE_PRECISION";
  passed: boolean;
  actual: number | null;
  required: number;
}

export interface PrototypeGate {
  name: "PROTOTYPE_VALIDATION";
  passed: boolean;
  participantCount: number;
  successfulParticipantCount: number;
  requiredParticipants: number;
  requiredSuccessfulParticipants: number;
}

export interface EvaluationRecommendation {
  code:
    | "PREPARE_20_LABELLED_CASES"
    | "IMPROVE_RECALL_AND_NORMALIZATION"
    | "TIGHTEN_HIGH_CONFIDENCE_RULES"
    | "RUN_RECRUITER_PROTOTYPE";
  message: string;
}

export interface EvaluationReport {
  schemaVersion: "evaluation-report-v1";
  datasetId: string;
  datasetVersion: string;
  datasetFingerprint: string;
  evaluatedAt: string;
  versions: EvaluationVersions;
  metrics: {
    caseCount: number;
    top5: RateMetric;
    highConfidencePrecision: RateMetric;
  };
  scenarioMetrics: ScenarioMetrics[];
  errors: EvaluationErrorCase[];
  gates: {
    offline: EvaluationGate[];
    prototype: PrototypeGate;
    offlinePassed: boolean;
    overallPassed: boolean;
  };
  recommendations: EvaluationRecommendation[];
}
