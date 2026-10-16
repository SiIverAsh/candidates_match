import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { CandidateProfile } from "../../../resume-parser";
import type {
  EmployeeEducationSnapshot,
  EmployeeSnapshot,
  EmployeeWorkSnapshot,
  MatchingContext,
  MatchingRepository,
} from "../../application/ports";
import type { MatchRun } from "../../domain/models";

const globalForMatching = globalThis as unknown as { matchingDatabase?: DatabaseSync };

function getDatabase(): DatabaseSync {
  if (!globalForMatching.matchingDatabase) {
    const filePath = process.env.CONNECTION_FINDER_DB_PATH ??
      path.join(process.cwd(), "var", "connection-finder.sqlite");
    mkdirSync(path.dirname(filePath), { recursive: true });
    const database = new DatabaseSync(filePath);
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("PRAGMA journal_mode = WAL");
    database.exec(`
      CREATE TABLE IF NOT EXISTS match_runs (
        id TEXT PRIMARY KEY,
        query_id TEXT NOT NULL UNIQUE,
        submitted_by TEXT NOT NULL,
        employee_version_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK (
          status IN ('COMPLETED', 'NO_RESULTS', 'SKIPPED_INSUFFICIENT')
        ),
        result_count INTEGER NOT NULL,
        run_json TEXT NOT NULL,
        rule_version TEXT NOT NULL,
        threshold_version TEXT NOT NULL,
        normalizer_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (query_id) REFERENCES candidate_queries(id) ON DELETE CASCADE,
        FOREIGN KEY (employee_version_id) REFERENCES employee_data_versions(id)
      );
      CREATE INDEX IF NOT EXISTS match_runs_expiry ON match_runs(expires_at);
    `);
    globalForMatching.matchingDatabase = database;
  }
  return globalForMatching.matchingDatabase;
}

interface ContextRow {
  query_id: string;
  submitted_by: string;
  submitted_at: string;
  expires_at: string;
  employee_version_id: string | null;
  profile_json: string;
}

interface EmployeeRow {
  employee_id: string;
  name: string;
  email: string;
  current_department: string;
  current_title: string;
}

interface WorkRow {
  id: number;
  employee_id: string;
  company: string;
  title: string;
  start_date: string;
  end_date: string | null;
}

interface EducationRow {
  id: number;
  employee_id: string;
  school: string;
  major: string;
  start_date: string;
  end_date: string | null;
}

export function loadMatchingContext(
  queryId: string,
  requestedBy: string,
  now: string,
): MatchingContext | null {
  const database = getDatabase();
  const row = database.prepare(`
    SELECT q.id AS query_id, q.submitted_by, q.submitted_at, q.expires_at,
           q.employee_version_id, p.profile_json
    FROM candidate_queries q
    JOIN candidate_profiles p ON p.query_id = q.id
    WHERE q.id = ? AND q.submitted_by = ?
      AND q.expires_at > ? AND p.expires_at > ?
  `).get(queryId, requestedBy, now, now) as unknown as ContextRow | undefined;
  if (!row) return null;
  if (!row.employee_version_id) {
    return { queryId: row.query_id, submittedBy: row.submitted_by, submittedAt: row.submitted_at, expiresAt: row.expires_at, employeeVersionId: null, profile: JSON.parse(row.profile_json) as CandidateProfile, employees: [] };
  }

  const employeeRows = database.prepare(`
    SELECT employee_id, name, email, current_department, current_title
    FROM employees WHERE version_id = ? ORDER BY employee_id
  `).all(row.employee_version_id) as unknown as EmployeeRow[];
  const workRows = database.prepare(`
    SELECT id, employee_id, company, title, start_date, end_date
    FROM work_experiences WHERE version_id = ? ORDER BY employee_id, id
  `).all(row.employee_version_id) as unknown as WorkRow[];
  const educationRows = database.prepare(`
    SELECT id, employee_id, school, major, start_date, end_date
    FROM education_experiences WHERE version_id = ? ORDER BY employee_id, id
  `).all(row.employee_version_id) as unknown as EducationRow[];

  const workByEmployee = new Map<string, EmployeeWorkSnapshot[]>();
  for (const work of workRows) {
    const list = workByEmployee.get(work.employee_id) ?? [];
    list.push({
      sequence: list.length,
      company: work.company,
      title: work.title,
      startDate: work.start_date,
      endDate: work.end_date,
    });
    workByEmployee.set(work.employee_id, list);
  }
  const educationByEmployee = new Map<string, EmployeeEducationSnapshot[]>();
  for (const education of educationRows) {
    const list = educationByEmployee.get(education.employee_id) ?? [];
    list.push({
      sequence: list.length,
      school: education.school,
      major: education.major,
      startDate: education.start_date,
      endDate: education.end_date,
    });
    educationByEmployee.set(education.employee_id, list);
  }
  const employees: EmployeeSnapshot[] = employeeRows.map((employee) => ({
    employeeId: employee.employee_id,
    name: employee.name,
    email: employee.email,
    currentDepartment: employee.current_department,
    currentTitle: employee.current_title,
    workExperiences: workByEmployee.get(employee.employee_id) ?? [],
    educations: educationByEmployee.get(employee.employee_id) ?? [],
  }));
  return {
    queryId: row.query_id,
    submittedBy: row.submitted_by,
    submittedAt: row.submitted_at,
    expiresAt: row.expires_at,
    employeeVersionId: row.employee_version_id,
    profile: JSON.parse(row.profile_json) as CandidateProfile,
    employees,
  };
}

export function saveMatchRun(run: MatchRun, requestedBy: string): void {
  const database = getDatabase();
  const ownsQuery = database.prepare(`
    SELECT 1 FROM candidate_queries
    WHERE id = ? AND submitted_by = ? AND expires_at > ?
  `).get(run.queryId, requestedBy, run.createdAt);
  if (!ownsQuery) throw new Error("QUERY_NOT_AVAILABLE");

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT INTO match_runs (
        id, query_id, submitted_by, employee_version_id, status,
        result_count, run_json, rule_version, threshold_version,
        normalizer_version, created_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(query_id) DO UPDATE SET
        id = excluded.id,
        employee_version_id = excluded.employee_version_id,
        status = excluded.status,
        result_count = excluded.result_count,
        run_json = excluded.run_json,
        rule_version = excluded.rule_version,
        threshold_version = excluded.threshold_version,
        normalizer_version = excluded.normalizer_version,
        created_at = excluded.created_at,
        expires_at = excluded.expires_at
    `).run(
      run.id,
      run.queryId,
      requestedBy,
      run.employeeVersionId,
      run.status,
      run.resultCount,
      JSON.stringify(run),
      run.ruleVersion,
      run.thresholdVersion,
      run.normalizerVersion,
      run.createdAt,
      run.expiresAt,
    );
    database.prepare(`
      INSERT INTO audit_events (
        id, actor_id, action_type, resource_ref, outcome, created_at
      ) VALUES (?, ?, 'CANDIDATE_MATCH_RUN', ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      requestedBy,
      run.queryId,
      run.status,
      run.createdAt,
    );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function findMatchRun(
  queryId: string,
  requestedBy: string,
  now: string,
): MatchRun | null {
  const row = getDatabase().prepare(`
    SELECT run_json FROM match_runs
    WHERE query_id = ? AND submitted_by = ? AND expires_at > ?
  `).get(queryId, requestedBy, now) as { run_json: string } | undefined;
  return row ? JSON.parse(row.run_json) as MatchRun : null;
}

export const matchingRepository: MatchingRepository = {
  loadContext: loadMatchingContext,
  saveRun: saveMatchRun,
  findRun: findMatchRun,
};
