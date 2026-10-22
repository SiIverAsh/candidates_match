import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { registerTextSearch } from "../../../../shared/infrastructure/sqlite/text-search";
import type { CandidateProfile } from "../../../resume-parser/domain/models";
import { candidateSearchFields } from "../../domain/search-fields";
import { candidateDateBounds, type CandidateColumnFilters } from "../../domain/column-filters";
import { possibleFunctionFilterValues, summarizePossibleFunctions } from "../../domain/possible-functions";
import type { ResearchFunctionAssessment } from "../../../research-functions/domain/models";

import type { CandidateActor } from "../../application/ports";
import type { CandidateMatchCategory, CandidateQuery, CandidateQueryPage, CandidateQuerySummary, CandidateSourcePayload } from "../../domain/models";

const globalForCandidateIntake = globalThis as unknown as {
  candidateIntakeDatabase?: DatabaseSync;
};

function getDatabase(): DatabaseSync {
  if (!globalForCandidateIntake.candidateIntakeDatabase) {
    const filePath = process.env.CONNECTION_FINDER_DB_PATH ??
      path.join(process.cwd(), "var", "connection-finder.sqlite");
    mkdirSync(path.dirname(filePath), { recursive: true });
    const database = new DatabaseSync(filePath);
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("PRAGMA journal_mode = WAL");
    registerTextSearch(database);
    database.function("candidate_search_fields", { deterministic: true }, profileJson =>
      profileJson === null ? "" : candidateSearchFields(JSON.parse(String(profileJson)) as CandidateProfile).join("\u001f"));
    const functionSummary = (value: unknown) => summarizePossibleFunctions(value === null ? null : JSON.parse(String(value)) as ResearchFunctionAssessment);
    database.function("candidate_function_summary", { deterministic: true }, value => JSON.stringify(functionSummary(value)));
    database.function("candidate_function_filter_values", { deterministic: true }, value => JSON.stringify(possibleFunctionFilterValues(functionSummary(value))));
    database.exec(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        resource_ref TEXT,
        outcome TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS candidate_queries (
        id TEXT PRIMARY KEY,
        submitted_by TEXT NOT NULL,
        submitted_by_name TEXT,
        submitted_at TEXT NOT NULL,
        employee_version_id TEXT,
        source_type TEXT NOT NULL CHECK (source_type IN ('FILE', 'TEXT')),
        source_format TEXT NOT NULL,
        mime_type TEXT,
        content_text TEXT,
        content_blob BLOB,
        status TEXT NOT NULL CHECK (status IN ('QUEUED_FOR_PARSING')),
        expires_at TEXT NOT NULL,
        FOREIGN KEY (employee_version_id) REFERENCES employee_data_versions(id),
        CHECK (
          (source_type = 'TEXT' AND content_text IS NOT NULL AND content_blob IS NULL)
          OR
          (source_type = 'FILE' AND content_blob IS NOT NULL AND content_text IS NULL)
        )
      );
      CREATE INDEX IF NOT EXISTS candidate_queries_expiry
        ON candidate_queries(expires_at);
      CREATE INDEX IF NOT EXISTS candidate_queries_submitter
        ON candidate_queries(submitted_by, submitted_at DESC);
    `);
    migrateOptionalEmployeeVersion(database);
    const columns = database.prepare("PRAGMA table_info(candidate_queries)").all();
    if (!columns.some(column => column.name === "submitted_by_name")) {
      database.exec("ALTER TABLE candidate_queries ADD COLUMN submitted_by_name TEXT");
    }
    globalForCandidateIntake.candidateIntakeDatabase = database;
  }
  return globalForCandidateIntake.candidateIntakeDatabase;
}

// Rebuild legacy tables without renaming the original so child foreign keys stay intact.
export function migrateOptionalEmployeeVersion(database: DatabaseSync): void {
  const columns = database.prepare("PRAGMA table_info(candidate_queries)").all() as Array<{ name: string; notnull: number }>;
  if (!columns.some((column) => column.name === "employee_version_id" && column.notnull)) return;
  const schema = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'candidate_queries'").get() as { sql: string };
  const indexes = database.prepare("SELECT sql FROM sqlite_master WHERE tbl_name = 'candidate_queries' AND type = 'index' AND sql IS NOT NULL").all() as Array<{ sql: string }>;
  database.exec("PRAGMA foreign_keys = OFF");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(schema.sql.replace(/candidate_queries/u, "candidate_queries_optional_version").replace(/employee_version_id TEXT NOT NULL/iu, "employee_version_id TEXT"));
    database.exec("INSERT INTO candidate_queries_optional_version SELECT * FROM candidate_queries");
    database.exec("DROP TABLE candidate_queries");
    database.exec("ALTER TABLE candidate_queries_optional_version RENAME TO candidate_queries");
    for (const index of indexes) database.exec(index.sql);
    if (database.prepare("PRAGMA foreign_key_check").all().length) throw new Error("FOREIGN_KEY_CHECK_FAILED");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.exec("PRAGMA foreign_keys = ON");
  }
}

export function purgeExpiredCandidateQueriesFromDatabase(
  database: DatabaseSync,
  now: string,
): number {
  const employeeSchemaReady = database.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'employee_data_versions'
  `).get();
  if (!employeeSchemaReady) return 0;
  const result = database.prepare(
    "DELETE FROM candidate_queries WHERE expires_at <= ?",
  ).run(now);
  return Number(result.changes);
}

export function purgeExpiredCandidateQueries(now: string): number {
  return purgeExpiredCandidateQueriesFromDatabase(getDatabase(), now);
}

export function createCandidateQuery(
  query: CandidateQuery,
  payload: CandidateSourcePayload,
  actor: CandidateActor,
): void {
  persistCandidateQuery(query, payload, actor, false);
}

export function createOrReuseCandidateQuery(
  query: CandidateQuery,
  payload: CandidateSourcePayload,
  actor: CandidateActor,
): { query: CandidateQuery; reused: boolean } {
  return persistCandidateQuery(query, payload, actor, true);
}

function persistCandidateQuery(
  query: CandidateQuery,
  payload: CandidateSourcePayload,
  actor: CandidateActor,
  reuse: boolean,
): { query: CandidateQuery; reused: boolean } {
  const database = getDatabase();
  database.exec("BEGIN IMMEDIATE");
  try {
    if (reuse) {
      const hasRuns = Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'match_runs'").get());
      const existing = database.prepare(`
        SELECT id, submitted_by, submitted_at, employee_version_id,
               source_type, source_format, status, expires_at
        FROM candidate_queries
        WHERE expires_at > ?
          AND source_type = ? AND source_format = ?
          AND content_text IS ? AND content_blob IS ?
        ORDER BY ${hasRuns ? "EXISTS (SELECT 1 FROM match_runs m WHERE m.query_id = candidate_queries.id AND m.expires_at > ?) DESC," : ""}
          submitted_at, id LIMIT 1
      `).get(
        query.submittedAt, payload.sourceType, payload.sourceFormat,
        payload.sourceType === "TEXT" ? payload.text : null,
        payload.sourceType === "FILE" ? payload.bytes : null,
        ...(hasRuns ? [query.submittedAt] : []),
      ) as Record<string, unknown> | undefined;
      if (existing) {
        database.prepare(`
          INSERT INTO audit_events (id, actor_id, action_type, resource_ref, outcome, created_at)
          VALUES (?, ?, 'CANDIDATE_QUERY_REUSED', ?, 'REUSED', ?)
        `).run(crypto.randomUUID(), actor.id, String(existing.id), query.submittedAt);
        database.exec("COMMIT");
        return { query: queryFromRow(existing), reused: true };
      }
    }

    database.prepare(`
      INSERT INTO candidate_queries (
        id, submitted_by, submitted_by_name, submitted_at, employee_version_id,
        source_type, source_format, mime_type, content_text, content_blob,
        status, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      query.id,
      query.submittedBy,
      actor.displayName,
      query.submittedAt,
      query.employeeVersionId,
      query.sourceType,
      query.sourceFormat,
      payload.sourceType === "FILE" ? payload.mimeType : null,
      payload.sourceType === "TEXT" ? payload.text : null,
      payload.sourceType === "FILE" ? payload.bytes : null,
      query.status,
      query.expiresAt,
    );
    database.prepare(`
      INSERT INTO audit_events (
        id, actor_id, action_type, resource_ref, outcome, created_at
      ) VALUES (?, ?, 'CANDIDATE_QUERY_SUBMITTED', ?, 'QUEUED', ?)
    `).run(crypto.randomUUID(), actor.id, query.id, query.submittedAt);
    database.exec("COMMIT");
    return { query, reused: false };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function queryFromRow(row: Record<string, unknown>): CandidateQuery {
  return {
    id: String(row.id), submittedBy: String(row.submitted_by), submittedAt: String(row.submitted_at),
    employeeVersionId: row.employee_version_id === null ? null : String(row.employee_version_id),
    sourceType: row.source_type as CandidateQuery["sourceType"], sourceFormat: String(row.source_format),
    status: "QUEUED_FOR_PARSING", expiresAt: String(row.expires_at),
  };
}

// The current application is one shared recruiting workspace; submitter IDs retain provenance.
export function findCandidateQuery(queryId: string, _requestedBy: string, now: string): CandidateQuery | null {
  const row = getDatabase().prepare("SELECT id, submitted_by, submitted_at, employee_version_id, source_type, source_format, status, expires_at FROM candidate_queries WHERE id = ? AND expires_at > ?")
    .get(queryId, now) as Record<string, unknown> | undefined;
  return row ? queryFromRow(row) : null;
}

export function listCandidateQueries(_requestedBy: string, now: string, page: number, search: string, resultsOnly: boolean, matchCategory?: CandidateMatchCategory, filters: CandidateColumnFilters = {}): CandidateQueryPage {
  const database = getDatabase();
  const tables = new Set(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  const hasProfiles = tables.has("candidate_profiles");
  const hasRuns = tables.has("match_runs");
  const name = hasProfiles ? "json_extract(p.profile_json, '$.candidateName')" : "NULL";
  const functionAssessment = hasProfiles ? "json_extract(p.profile_json, '$.researchFunctions')" : "NULL";
  const joins = [
    hasProfiles ? "LEFT JOIN candidate_profiles p ON p.query_id = q.id AND p.submitted_by = q.submitted_by AND p.expires_at > ?" : "",
    hasRuns ? "LEFT JOIN match_runs m ON m.query_id = q.id AND m.submitted_by = q.submitted_by AND m.expires_at > ?" : "",
  ].join(" ");
  const searchWhere = search ? ` AND text_search_matches(?, q.id, q.content_text, candidate_search_fields(${hasProfiles ? "p.profile_json" : "NULL"}))` : "";
  const available = hasRuns ? "m.id IS NOT NULL AND m.status = 'COMPLETED' AND m.result_count > 0" : "0";
  const unavailable = hasRuns ? `m.id IS NOT NULL AND NOT (${available})` : "0";
  const columnWhere: string[] = [];
  const columnParams: string[] = [];
  function selectValues(column: string, values?: string[]) {
    if (values === undefined) return;
    columnWhere.push(values.length ? `${column} IN (${values.map(() => "?").join(", ")})` : "0");
    columnParams.push(...values);
  }
  if (filters.name) {
    columnWhere.push(`text_search_matches(?, ${name}, q.id)`);
    columnParams.push(filters.name);
  }
  if (filters.submittedBy) {
    columnWhere.push("text_search_matches(?, q.submitted_by_name, q.submitted_by)");
    columnParams.push(filters.submittedBy);
  }
  if (filters.possibleFunctions !== undefined) {
    const values = filters.possibleFunctions;
    columnWhere.push(values.length
      ? `EXISTS (SELECT 1 FROM json_each(candidate_function_filter_values(${functionAssessment})) AS function_filter WHERE function_filter.value IN (${values.map(() => "?").join(", ")}))`
      : "0");
    columnParams.push(...values);
  }
  selectValues(hasProfiles ? "COALESCE(p.parse_status, 'PENDING')" : "'PENDING'", filters.parseStatuses);
  selectValues("q.source_format", filters.sourceFormats);
  selectValues(hasRuns ? `CASE WHEN (${available}) THEN 'FOUND' WHEN m.status = 'SKIPPED_INSUFFICIENT' THEN 'INSUFFICIENT' WHEN m.id IS NOT NULL THEN 'NO_RESULTS' ELSE 'PENDING' END` : "'PENDING'", filters.matchStatuses);
  for (const [column, from, to] of [
    ["q.submitted_at", filters.submittedFrom, filters.submittedTo],
    ["q.expires_at", filters.expiresFrom, filters.expiresTo],
  ]) {
    const bounds = candidateDateBounds(from, to);
    if (bounds.start) { columnWhere.push(`${column} >= ?`); columnParams.push(bounds.start); }
    if (bounds.end) { columnWhere.push(`${column} < ?`); columnParams.push(bounds.end); }
  }
  const baseWhere = `q.expires_at > ?${searchWhere}${columnWhere.length ? ` AND ${columnWhere.join(" AND ")}` : ""}`;
  const categoryWhere = matchCategory === "FOUND" ? available : matchCategory === "NOT_FOUND" ? unavailable : hasRuns ? "m.id IS NOT NULL" : "0";
  const where = `${baseWhere}${resultsOnly ? ` AND (${categoryWhere})` : ""}`;
  const params = [...(hasProfiles ? [now] : []), ...(hasRuns ? [now] : []), now, ...(search ? [search] : []), ...columnParams];
  const count = database.prepare(`SELECT COUNT(*) AS total,
    COALESCE(SUM(CASE WHEN ${available} THEN 1 ELSE 0 END), 0) AS found,
    COALESCE(SUM(CASE WHEN ${unavailable} THEN 1 ELSE 0 END), 0) AS not_found
    FROM candidate_queries q ${joins} WHERE ${baseWhere}`).get(...params) as { total: number; found: number; not_found: number };
  const resultCounts = { found: Number(count.found), notFound: Number(count.not_found) };
  const total = resultsOnly ? matchCategory === "FOUND" ? resultCounts.found : matchCategory === "NOT_FOUND" ? resultCounts.notFound : resultCounts.found + resultCounts.notFound : Number(count.total);
  const pageSize = 20;
  const rows = database.prepare(`
    SELECT q.id, q.submitted_by, q.submitted_by_name, q.submitted_at, q.employee_version_id, q.source_type, q.source_format, q.status, q.expires_at, ${name} AS candidate_name, ${hasProfiles ? "p.parse_status" : "NULL"} AS parse_status,
      ${hasRuns ? "m.status" : "NULL"} AS match_status, ${hasRuns ? "m.result_count" : "NULL"} AS result_count,
      ${hasRuns ? "m.created_at" : "NULL"} AS matched_at,
      candidate_function_summary(${functionAssessment}) AS possible_functions
    FROM candidate_queries q ${joins} WHERE ${where}
    ORDER BY q.submitted_at DESC, q.id DESC LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
  return { total, page, pageSize, resultCounts, items: rows.map((row): CandidateQuerySummary => ({
    ...queryFromRow(row), candidateName: row.candidate_name as string | null,
    submittedByName: row.submitted_by_name as string | null,
    parseStatus: row.parse_status as CandidateQuerySummary["parseStatus"],
    possibleFunctions: JSON.parse(String(row.possible_functions)) as CandidateQuerySummary["possibleFunctions"],
    matching: row.match_status ? { status: row.match_status as NonNullable<CandidateQuerySummary["matching"]>["status"], resultCount: Number(row.result_count), createdAt: String(row.matched_at) } : null,
  })) };
}
