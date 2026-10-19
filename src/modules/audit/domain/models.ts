export type AuditActionType =
  | "AI_CHAT"
  | "CANDIDATE_BATCH"
  | "LOGIN"
  | "LOGOUT"
  | "ACCESS_DENIED"
  | "MATCH_RESULT_ACCESSED"
  | "EMPLOYEE_TEMPLATE_DOWNLOADED"
  | "CANDIDATE_RETENTION_PURGE";

export interface AuditEventInput {
  actorId: string;
  actionType: AuditActionType;
  resourceRef: string | null;
  outcome: string;
  occurredAt: string;
}

export interface RetentionRun {
  id: string;
  jobType: "CANDIDATE_DATA_PURGE";
  status: "SUCCESS" | "FAILED";
  startedAt: string;
  completedAt: string;
  deletedCount: number;
  errorCode: "PURGE_FAILED" | null;
}

export type CandidateRetentionResult =
  | { ok: true; run: RetentionRun }
  | { ok: false; run: RetentionRun };
