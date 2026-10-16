import type {
  EmployeeMatchResult,
  MatchConfidence,
  MatchRun,
} from "../../matching/domain/models";

export const CONFIDENCE_ORDER = ["HIGH", "MEDIUM", "LOW"] as const;

export const CONFIDENCE_LABELS: Record<MatchConfidence, string> = {
  HIGH: "高置信度",
  MEDIUM: "中置信度",
  LOW: "低置信度",
};

export interface ResultGroup {
  confidence: MatchConfidence;
  label: string;
  results: EmployeeMatchResult[];
}

export function isGroupInitiallyOpen(confidence: MatchConfidence): boolean {
  return confidence === "HIGH";
}

export function groupMatchResults(run: MatchRun): ResultGroup[] {
  return CONFIDENCE_ORDER.map((confidence) => ({
    confidence,
    label: CONFIDENCE_LABELS[confidence],
    results: run.results
      .filter((result) => result.confidence === confidence)
      .slice()
      .sort((left, right) => left.rank - right.rank),
  }));
}
