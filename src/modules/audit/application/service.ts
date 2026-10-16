import type { AuditEventInput, CandidateRetentionResult, RetentionRun } from "../domain/models";
import type { AuditDependencies } from "./ports";

export function recordAuditEvent(
  event: Omit<AuditEventInput, "occurredAt">,
  dependencies: AuditDependencies,
): void {
  dependencies.repository.recordEvent({
    ...event,
    id: dependencies.createId(),
    occurredAt: dependencies.now().toISOString(),
  });
}

export function runCandidateRetention(
  purge: (now: string) => number,
  dependencies: AuditDependencies,
): CandidateRetentionResult {
  const id = dependencies.createId();
  const startedAt = dependencies.now().toISOString();
  let deletedCount: number;
  try {
    deletedCount = purge(startedAt);
  } catch {
    const run: RetentionRun = {
      id,
      jobType: "CANDIDATE_DATA_PURGE",
      status: "FAILED",
      startedAt,
      completedAt: dependencies.now().toISOString(),
      deletedCount: 0,
      errorCode: "PURGE_FAILED",
    };
    dependencies.repository.recordRetentionRun(run);
    dependencies.repository.recordEvent({
      id: dependencies.createId(),
      actorId: "system",
      actionType: "CANDIDATE_RETENTION_PURGE",
      resourceRef: null,
      outcome: "FAILED",
      occurredAt: run.completedAt,
    });
    return { ok: false, run };
  }

  const run: RetentionRun = {
    id,
    jobType: "CANDIDATE_DATA_PURGE",
    status: "SUCCESS",
    startedAt,
    completedAt: dependencies.now().toISOString(),
    deletedCount,
    errorCode: null,
  };
  dependencies.repository.recordRetentionRun(run);
  dependencies.repository.recordEvent({
    id: dependencies.createId(),
    actorId: "system",
    actionType: "CANDIDATE_RETENTION_PURGE",
    resourceRef: null,
    outcome: "SUCCESS:" + deletedCount,
    occurredAt: run.completedAt,
  });
  return { ok: true, run };
}
