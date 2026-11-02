import { assessCandidateReview, type CandidateReviewFilter } from "../domain/manual-review";
import type { CandidateActor, CandidateReviewRepository } from "./ports";

export function getCandidateReview(queryId: string, repository: CandidateReviewRepository, now: string) {
  const context = repository.findReviewContext(queryId, now);
  return context ? assessCandidateReview(context.run, context.decision) : null;
}

export function reviewCandidate(
  queryId: string,
  runId: string,
  status: CandidateReviewFilter,
  actor: CandidateActor,
  repository: CandidateReviewRepository,
  now: string,
) {
  const review = getCandidateReview(queryId, repository, now);
  if (!review) return { kind: "not_found" } as const;
  if (review.runId !== runId || review.status === "NONE") return { kind: "conflict" } as const;
  const decision = status === "REVIEWED" ? review.decision ?? { runId, reviewedBy: actor.id, reviewedByName: actor.displayName, reviewedAt: now } : null;
  if (!repository.saveReview(queryId, runId, decision, actor, now)) return { kind: "conflict" } as const;
  return { kind: "saved", review: getCandidateReview(queryId, repository, now)! } as const;
}
