import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { ImportActor, ImportFailureCode } from "../../application/ports";

import type {
  EmployeeDataOverview,
  EmployeeDataVersionSummary,
  ImportAttemptSummary,
  ParsedEmployeeData,
  EmployeeDirectoryPage,
  EmployeeProfile,
  EmployeeRecord,
} from "../../domain/models";

const globalForEmployeeData = globalThis as unknown as {
  employeeDataDatabase?: DatabaseSync;
};

function getDatabase(): DatabaseSync {
  if (!globalForEmployeeData.employeeDataDatabase) {
    const filePath = process.env.CONNECTION_FINDER_DB_PATH ??
      path.join(process.cwd(), "var", "connection-finder.sqlite");
    mkdirSync(path.dirname(filePath), { recursive: true });
    const database = new DatabaseSync(filePath);
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("PRAGMA journal_mode = WAL");
    database.exec(`
      CREATE TABLE IF NOT EXISTS employee_data_versions (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'ARCHIVED')),
        imported_at TEXT NOT NULL,
        imported_by_id TEXT NOT NULL,
        imported_by_name TEXT NOT NULL,
        employee_count INTEGER NOT NULL,
        work_experience_count INTEGER NOT NULL,
        education_count INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX IF NOT EXISTS employee_data_one_active_version
        ON employee_data_versions(status) WHERE status = 'ACTIVE';
      CREATE TABLE IF NOT EXISTS employees (
        version_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        current_department TEXT NOT NULL,
        current_title TEXT NOT NULL,
        PRIMARY KEY (version_id, employee_id),
        FOREIGN KEY (version_id) REFERENCES employee_data_versions(id)
      );
      CREATE TABLE IF NOT EXISTS work_experiences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        company TEXT NOT NULL,
        title TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT,
        FOREIGN KEY (version_id, employee_id)
          REFERENCES employees(version_id, employee_id)
      );
      CREATE TABLE IF NOT EXISTS education_experiences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        school TEXT NOT NULL,
        major TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT,
        FOREIGN KEY (version_id, employee_id)
          REFERENCES employees(version_id, employee_id)
      );
      CREATE TABLE IF NOT EXISTS employee_import_attempts (
        id TEXT PRIMARY KEY,
        attempted_at TEXT NOT NULL,
        attempted_by_id TEXT NOT NULL,
        attempted_by_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('SUCCESS', 'FAILED')),
        outcome_code TEXT NOT NULL,
        issue_count INTEGER NOT NULL,
        version_id TEXT,
        FOREIGN KEY (version_id) REFERENCES employee_data_versions(id)
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        actor_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        resource_ref TEXT,
        outcome TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS employee_import_attempts_recent
        ON employee_import_attempts(attempted_at DESC);
      CREATE INDEX IF NOT EXISTS employees_by_version ON employees(version_id);
    `);
    globalForEmployeeData.employeeDataDatabase = database;
  }
  return globalForEmployeeData.employeeDataDatabase;
}

function employeeFromRow(row: Record<string, unknown>): EmployeeRecord {
  return { employeeId: String(row.employee_id), name: String(row.name), email: String(row.email), currentDepartment: String(row.current_department), currentTitle: String(row.current_title) };
}

export function listCurrentEmployees(page: number, search: string): EmployeeDirectoryPage {
  const database = getDatabase();
  const version = getEmployeeDataOverview().activeVersion;
  const pageSize = 20;
  if (!version) return { versionId: null, items: [], total: 0, page, pageSize };
  const where = "version_id = ? AND (instr(lower(name || ' ' || employee_id || ' ' || email || ' ' || current_department || ' ' || current_title), lower(?)) > 0)";
  const count = database.prepare(`SELECT COUNT(*) AS total FROM employees WHERE ${where}`).get(version.id, search) as { total: number };
  const rows = database.prepare(`SELECT * FROM employees WHERE ${where} ORDER BY employee_id LIMIT ? OFFSET ?`).all(version.id, search, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
  return { versionId: version.id, items: rows.map(employeeFromRow), total: Number(count.total), page, pageSize };
}

export function findEmployeeProfile(employeeId: string, versionId: string): EmployeeProfile | null {
  const database = getDatabase();
  const row = database.prepare("SELECT * FROM employees WHERE version_id = ? AND employee_id = ?").get(versionId, employeeId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const workRows = database.prepare("SELECT * FROM work_experiences WHERE version_id = ? AND employee_id = ? ORDER BY start_date DESC, id DESC").all(versionId, employeeId) as Record<string, unknown>[];
  const educationRows = database.prepare("SELECT * FROM education_experiences WHERE version_id = ? AND employee_id = ? ORDER BY start_date DESC, id DESC").all(versionId, employeeId) as Record<string, unknown>[];
  return {
    ...employeeFromRow(row), versionId,
    workExperiences: workRows.map((work) => ({ employeeId, company: String(work.company), title: String(work.title), startDate: String(work.start_date), endDate: work.end_date as string | null })),
    educations: educationRows.map((education) => ({ employeeId, school: String(education.school), major: String(education.major), startDate: String(education.start_date), endDate: education.end_date as string | null })),
  };
}

function createVersionId(now: string): string {
  const stamp = now.replaceAll(/[-:.TZ]/gu, "").slice(0, 14);
  return `emp-${stamp}-${crypto.randomUUID().slice(0, 8)}`;
}

function mapVersion(row: Record<string, unknown>): EmployeeDataVersionSummary {
  return {
    id: String(row.id),
    importedAt: String(row.imported_at),
    importedBy: String(row.imported_by_name),
    employeeCount: Number(row.employee_count),
    workExperienceCount: Number(row.work_experience_count),
    educationCount: Number(row.education_count),
  };
}

function mapAttempt(row: Record<string, unknown>): ImportAttemptSummary {
  return {
    id: String(row.id),
    attemptedAt: String(row.attempted_at),
    attemptedBy: String(row.attempted_by_name),
    status: row.status === "SUCCESS" ? "SUCCESS" : "FAILED",
    outcomeCode: String(row.outcome_code),
    issueCount: Number(row.issue_count),
    versionId: row.version_id ? String(row.version_id) : null,
  };
}

export function getEmployeeDataOverview(): EmployeeDataOverview {
  const database = getDatabase();
  const activeRow = database.prepare(`
    SELECT id, imported_at, imported_by_name, employee_count,
           work_experience_count, education_count
    FROM employee_data_versions WHERE status = 'ACTIVE' LIMIT 1
  `).get() as Record<string, unknown> | undefined;
  const attemptRows = database.prepare(`
    SELECT id, attempted_at, attempted_by_name, status, outcome_code,
           issue_count, version_id
    FROM employee_import_attempts ORDER BY attempted_at DESC LIMIT 8
  `).all() as Record<string, unknown>[];
  return {
    activeVersion: activeRow ? mapVersion(activeRow) : null,
    recentAttempts: attemptRows.map(mapAttempt),
  };
}

export function recordFailedImport(
  actor: ImportActor,
  outcomeCode: ImportFailureCode,
  issueCount: number,
): void {
  const database = getDatabase();
  const attemptedAt = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT INTO employee_import_attempts (
        id, attempted_at, attempted_by_id, attempted_by_name,
        status, outcome_code, issue_count, version_id
      ) VALUES (?, ?, ?, ?, 'FAILED', ?, ?, NULL)
    `).run(
      crypto.randomUUID(), attemptedAt, actor.id, actor.displayName,
      outcomeCode, issueCount,
    );
    database.prepare(`
      INSERT INTO audit_events (
        id, actor_id, action_type, resource_ref, outcome, created_at
      ) VALUES (?, ?, 'EMPLOYEE_DATA_IMPORT', NULL, ?, ?)
    `).run(crypto.randomUUID(), actor.id, outcomeCode, attemptedAt);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function publishEmployeeData(
  data: ParsedEmployeeData,
  actor: ImportActor,
): EmployeeDataVersionSummary {
  const database = getDatabase();
  const importedAt = new Date().toISOString();
  const id = createVersionId(importedAt);
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT INTO employee_data_versions (
        id, status, imported_at, imported_by_id, imported_by_name,
        employee_count, work_experience_count, education_count
      ) VALUES (?, 'ARCHIVED', ?, ?, ?, ?, ?, ?)
    `).run(
      id, importedAt, actor.id, actor.displayName, data.employees.length,
      data.workExperiences.length, data.educationExperiences.length,
    );
    const employeeStatement = database.prepare(`
      INSERT INTO employees (
        version_id, employee_id, name, email, current_department, current_title
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const employee of data.employees) {
      employeeStatement.run(
        id, employee.employeeId, employee.name, employee.email,
        employee.currentDepartment, employee.currentTitle,
      );
    }
    const workStatement = database.prepare(`
      INSERT INTO work_experiences (
        version_id, employee_id, company, title, start_date, end_date
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const experience of data.workExperiences) {
      workStatement.run(
        id, experience.employeeId, experience.company, experience.title,
        experience.startDate, experience.endDate,
      );
    }
    const educationStatement = database.prepare(`
      INSERT INTO education_experiences (
        version_id, employee_id, school, major, start_date, end_date
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const education of data.educationExperiences) {
      educationStatement.run(
        id, education.employeeId, education.school, education.major,
        education.startDate, education.endDate,
      );
    }
    database.prepare(
      "UPDATE employee_data_versions SET status = 'ARCHIVED' WHERE status = 'ACTIVE'",
    ).run();
    database.prepare(
      "UPDATE employee_data_versions SET status = 'ACTIVE' WHERE id = ?",
    ).run(id);
    database.prepare(`
      INSERT INTO employee_import_attempts (
        id, attempted_at, attempted_by_id, attempted_by_name,
        status, outcome_code, issue_count, version_id
      ) VALUES (?, ?, ?, ?, 'SUCCESS', 'PUBLISHED', 0, ?)
    `).run(crypto.randomUUID(), importedAt, actor.id, actor.displayName, id);
    database.prepare(`
      INSERT INTO audit_events (
        id, actor_id, action_type, resource_ref, outcome, created_at
      ) VALUES (?, ?, 'EMPLOYEE_DATA_IMPORT', ?, 'PUBLISHED', ?)
    `).run(crypto.randomUUID(), actor.id, id, importedAt);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  return {
    id,
    importedAt,
    importedBy: actor.displayName,
    employeeCount: data.employees.length,
    workExperienceCount: data.workExperiences.length,
    educationCount: data.educationExperiences.length,
  };
}



