import { recordAuditEvent, runCandidateRetention } from "./application/service";
import type { AuditEventInput } from "./domain/models";
import { auditRepository } from "./infrastructure/sqlite/repository";

const dependencies = {
  repository: auditRepository,
  now: () => new Date(),
  createId: () => crypto.randomUUID(),
};

export const auditApplication = {
  record: (event: Omit<AuditEventInput, "occurredAt">) =>
    recordAuditEvent(event, dependencies),
  runCandidateRetention: (purge: (now: string) => number) =>
    runCandidateRetention(purge, dependencies),
};
