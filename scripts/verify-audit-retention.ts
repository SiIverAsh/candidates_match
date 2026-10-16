import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import type { AuditDependencies } from "../src/modules/audit/application/ports";
import {
  recordAuditEvent,
  runCandidateRetention,
} from "../src/modules/audit/application/service";
import {
  initializeAuditSchema,
  recordAuditEventInDatabase,
  recordRetentionRunInDatabase,
} from "../src/modules/audit/infrastructure/sqlite/repository";
import {
  purgeExpiredCandidateQueriesFromDatabase,
} from "../src/modules/candidate-intake/infrastructure/sqlite/repository";

const database = new DatabaseSync(":memory:");
database.exec("PRAGMA foreign_keys = ON");
database.exec(`
  CREATE TABLE employee_data_versions (
    id TEXT PRIMARY KEY
  );
  CREATE TABLE candidate_queries (
    id TEXT PRIMARY KEY,
    submitted_by TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    employee_version_id TEXT NOT NULL,
    FOREIGN KEY (employee_version_id) REFERENCES employee_data_versions(id)
  );
  CREATE TABLE candidate_profiles (
    query_id TEXT PRIMARY KEY,
    profile_json TEXT NOT NULL,
    FOREIGN KEY (query_id) REFERENCES candidate_queries(id) ON DELETE CASCADE
  );
  CREATE TABLE match_runs (
    id TEXT PRIMARY KEY,
    query_id TEXT NOT NULL UNIQUE,
    run_json TEXT NOT NULL,
    FOREIGN KEY (query_id) REFERENCES candidate_queries(id) ON DELETE CASCADE
  );
  INSERT INTO employee_data_versions (id) VALUES ('employee-v1');
  INSERT INTO candidate_queries (id, submitted_by, expires_at, employee_version_id)
    VALUES
      ('expired-query', 'test-user', '2026-09-27T00:00:00.000Z', 'employee-v1'),
      ('live-query', 'test-user', '2026-10-05T00:00:00.000Z', 'employee-v1');
  INSERT INTO candidate_profiles (query_id, profile_json)
    VALUES
      ('expired-query', '{"candidate":"SECRET_RESUME"}'),
      ('live-query', '{"candidate":"LIVE"}');
  INSERT INTO match_runs (id, query_id, run_json)
    VALUES
      ('expired-run', 'expired-query', '{"email":"secret@example.com"}'),
      ('live-run', 'live-query', '{"email":"live@example.com"}');
`);
initializeAuditSchema(database);

let idSequence = 0;
const times = [
  "2026-09-28T00:00:00.000Z",
  "2026-09-28T00:00:01.000Z",
  "2026-09-28T00:00:02.000Z",
  "2026-09-28T00:00:03.000Z",
  "2026-09-28T00:00:04.000Z",
  "2026-09-28T00:00:05.000Z",
];
let timeSequence = 0;
const dependencies: AuditDependencies = {
  repository: {
    recordEvent: (event) => recordAuditEventInDatabase(database, event),
    recordRetentionRun: (run) => recordRetentionRunInDatabase(database, run),
  },
  now: () => new Date(times[timeSequence++] ?? "2026-09-28T00:00:06.000Z"),
  createId: () => `audit-retention-${++idSequence}`,
};

recordAuditEvent({
  actorId: "test-user",
  actionType: "LOGIN",
  resourceRef: null,
  outcome: "SUCCESS",
}, dependencies);

const success = runCandidateRetention(
  (now) => purgeExpiredCandidateQueriesFromDatabase(database, now),
  dependencies,
);
assert.equal(success.ok, true);
assert.equal(success.run.deletedCount, 1);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM candidate_queries WHERE id = 'expired-query'")
    .get()?.count,
  0,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM candidate_profiles WHERE query_id = 'expired-query'")
    .get()?.count,
  0,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM match_runs WHERE query_id = 'expired-query'")
    .get()?.count,
  0,
);
assert.equal(
  database.prepare("SELECT COUNT(*) AS count FROM candidate_queries WHERE id = 'live-query'")
    .get()?.count,
  1,
);

const failure = runCandidateRetention(
  () => { throw new Error("SECRET_RESUME must never be persisted"); },
  dependencies,
);
assert.equal(failure.ok, false);
assert.equal(failure.run.errorCode, "PURGE_FAILED");

const auditColumns = database.prepare("PRAGMA table_info(audit_events)").all()
  .map((row) => String(row.name));
assert.deepEqual(auditColumns, [
  "id",
  "actor_id",
  "action_type",
  "resource_ref",
  "outcome",
  "created_at",
]);

const serializedAudit = JSON.stringify(
  database.prepare("SELECT * FROM audit_events ORDER BY created_at").all(),
);
assert.equal(serializedAudit.includes("SECRET_RESUME"), false);
assert.equal(serializedAudit.includes("secret@example.com"), false);
assert.equal(serializedAudit.includes("password"), false);
assert.equal(serializedAudit.includes("token"), false);

const retentionRows = database.prepare(
  "SELECT status, deleted_count, error_code FROM retention_runs ORDER BY started_at",
).all()
  .map((row) => ({
    status: String(row.status),
    deleted_count: Number(row.deleted_count),
    error_code: row.error_code === null ? null : String(row.error_code),
  }));
assert.deepEqual(retentionRows, [
  { status: "SUCCESS", deleted_count: 1, error_code: null },
  { status: "FAILED", deleted_count: 0, error_code: "PURGE_FAILED" },
]);

database.close();
console.log("Audit and retention verification passed");
