import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { AuditRepository } from "../../application/ports";
import type { AuditEventInput, RetentionRun } from "../../domain/models";

const globalForAudit = globalThis as unknown as { auditDatabase?: DatabaseSync };

export function initializeAuditSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      resource_ref TEXT,
      outcome TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_events_recent
      ON audit_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_events_actor
      ON audit_events(actor_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS retention_runs (
      id TEXT PRIMARY KEY,
      job_type TEXT NOT NULL CHECK (job_type IN ('CANDIDATE_DATA_PURGE')),
      status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
      started_at TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      deleted_count INTEGER NOT NULL,
      error_code TEXT
    );
    CREATE INDEX IF NOT EXISTS retention_runs_recent
      ON retention_runs(started_at DESC);
  `);
}

function getDatabase(): DatabaseSync {
  if (!globalForAudit.auditDatabase) {
    const filePath = process.env.CONNECTION_FINDER_DB_PATH ??
      path.join(process.cwd(), "var", "connection-finder.sqlite");
    mkdirSync(path.dirname(filePath), { recursive: true });
    const database = new DatabaseSync(filePath);
    database.exec("PRAGMA journal_mode = WAL");
    initializeAuditSchema(database);
    globalForAudit.auditDatabase = database;
  }
  return globalForAudit.auditDatabase;
}

export function recordAuditEventInDatabase(
  database: DatabaseSync,
  event: AuditEventInput & { id: string },
): void {
  database.prepare(`
    INSERT INTO audit_events (
      id, actor_id, action_type, resource_ref, outcome, created_at
    ) VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    event.id,
    event.actorId,
    event.actionType,
    event.resourceRef,
    event.outcome,
    event.occurredAt,
  );
}

export function recordAuditEvent(event: AuditEventInput & { id: string }): void {
  recordAuditEventInDatabase(getDatabase(), event);
}

export function recordRetentionRunInDatabase(
  database: DatabaseSync,
  run: RetentionRun,
): void {
  database.prepare(`
    INSERT INTO retention_runs (
      id, job_type, status, started_at, completed_at, deleted_count, error_code
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id,
    run.jobType,
    run.status,
    run.startedAt,
    run.completedAt,
    run.deletedCount,
    run.errorCode,
  );
}

export function recordRetentionRun(run: RetentionRun): void {
  recordRetentionRunInDatabase(getDatabase(), run);
}

export const auditRepository: AuditRepository = {
  recordEvent: recordAuditEvent,
  recordRetentionRun,
};
