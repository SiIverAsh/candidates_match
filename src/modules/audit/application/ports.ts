import type { AuditEventInput, RetentionRun } from "../domain/models";

export interface AuditRepository {
  recordEvent(event: AuditEventInput & { id: string }): void;
  recordRetentionRun(run: RetentionRun): void;
}

export interface AuditDependencies {
  repository: AuditRepository;
  now(): Date;
  createId(): string;
}
