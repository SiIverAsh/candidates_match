import type { MatchRun } from "../../matching/domain/models";

export type CandidateReviewFilter = "PENDING" | "REVIEWED";
export type ReviewMatchRun = Pick<MatchRun, "id" | "status" | "resultCount">;

export interface CandidateReviewDecision {
  runId: string;
  reviewedBy: string;
  reviewedByName: string;
  reviewedAt: string;
}

export interface CandidateReview {
  status: "NONE" | CandidateReviewFilter;
  reason: "NO_RESULTS" | "INSUFFICIENT" | null;
  runId: string | null;
  decision: CandidateReviewDecision | null;
}

export const REVIEW_REASON_LABELS = {
  NO_RESULTS: "未匹配到内部同事",
  INSUFFICIENT: "简历信息不足，未能执行匹配",
} as const;

export function assessCandidateReview(run: ReviewMatchRun | null, decision: CandidateReviewDecision | null): CandidateReview {
  if (!run || run.resultCount !== 0) return { status: "NONE", reason: null, runId: run?.id ?? null, decision: null };
  const currentDecision = decision?.runId === run.id ? decision : null;
  return {
    status: currentDecision ? "REVIEWED" : "PENDING",
    reason: run.status === "SKIPPED_INSUFFICIENT" ? "INSUFFICIENT" : "NO_RESULTS",
    runId: run.id,
    decision: currentDecision,
  };
}
