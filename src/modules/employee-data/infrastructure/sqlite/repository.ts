import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { registerTextSearch } from "../../../../shared/infrastructure/sqlite/text-search";
import { EmployeeImportConflict } from "../../domain/resume-import";

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
    registerTextSearch(database);
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
      CREATE TABLE IF NOT EXISTS research_experiences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        version_id TEXT NOT NULL,
        employee_id TEXT NOT NULL,
        heading TEXT NOT NULL,
        description TEXT NOT NULL,
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
      CREATE INDEX IF NOT EXISTS work_experiences_by_employee ON work_experiences(version_id, employee_id);
      CREATE INDEX IF NOT EXISTS education_experiences_by_employee ON education_experiences(version_id, employee_id);
      CREATE INDEX IF NOT EXISTS research_experiences_by_employee ON research_experiences(version_id, employee_id);
    `);
    const additions = {
      employees: { profile_url: "TEXT NOT NULL DEFAULT ''", warnings_json: "TEXT NOT NULL DEFAULT '[]'", resume_text: "TEXT NOT NULL DEFAULT ''", resume_fingerprint: "TEXT NOT NULL DEFAULT ''" },
      work_experiences: { current: "INTEGER", description: "TEXT NOT NULL DEFAULT ''" },
      education_experiences: { current: "INTEGER", degree: "TEXT NOT NULL DEFAULT ''" },
    };
    for (const [table, definitions] of Object.entries(additions)) {
      const columns = new Set((database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(column => column.name));
      for (const [column, definition] of Object.entries(definitions)) {
        if (!columns.has(column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
      }
    }
    globalForEmployeeData.employeeDataDatabase = database;
  }
  return globalForEmployeeData.employeeDataDatabase;
}

function employeeFromRow(row: Record<string, unknown>): EmployeeRecord {
  return { employeeId: String(row.employee_id), name: String(row.name), email: String(row.email), currentDepartment: String(row.current_department), currentTitle: String(row.current_title), profileUrl: String(row.profile_url), resumeFingerprint: row.resume_fingerprint ? String(row.resume_fingerprint) : null, warnings: JSON.parse(String(row.warnings_json)) as string[], ...(row.resume_text ? { sourceText: String(row.resume_text) } : {}) };
}

export function listCurrentEmployees(page: number, search: string): EmployeeDirectoryPage {
  const database = getDatabase();
  const version = getEmployeeDataOverview().activeVersion;
  const pageSize = 20;
  if (!version) return { versionId: null, items: [], total: 0, page, pageSize };
  const searchWhere = search ? ` AND text_search_matches(?, e.name, e.employee_id, e.email, e.current_department, e.current_title,
    (SELECT group_concat(w.company || char(31) || w.title, char(31)) FROM work_experiences w WHERE w.version_id = e.version_id AND w.employee_id = e.employee_id),
    (SELECT group_concat(d.school || char(31) || d.major, char(31)) FROM education_experiences d WHERE d.version_id = e.version_id AND d.employee_id = e.employee_id))` : "";
  const where = `e.version_id = ?${searchWhere}`;
  const params = [version.id, ...(search ? [search] : [])];
  const count = database.prepare(`SELECT COUNT(*) AS total FROM employees e WHERE ${where}`).get(...params) as { total: number };
  const rows = database.prepare(`SELECT e.employee_id, e.name, e.email, e.current_department, e.current_title, e.profile_url, e.warnings_json FROM employees e WHERE ${where} ORDER BY e.employee_id LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize) as Record<string, unknown>[];
  return { versionId: version.id, items: rows.map(employeeFromRow), total: Number(count.total), page, pageSize };
}

export function findEmployeeProfile(employeeId: string, versionId: string): EmployeeProfile | null {
  const database = getDatabase();
  const row = database.prepare("SELECT * FROM employees WHERE version_id = ? AND employee_id = ?").get(versionId, employeeId) as Record<string, unknown> | undefined;
  if (!row) return null;
  const workRows = database.prepare("SELECT * FROM work_experiences WHERE version_id = ? AND employee_id = ? ORDER BY start_date DESC, id DESC").all(versionId, employeeId) as Record<string, unknown>[];
  const educationRows = database.prepare("SELECT * FROM education_experiences WHERE version_id = ? AND employee_id = ? ORDER BY start_date DESC, id DESC").all(versionId, employeeId) as Record<string, unknown>[];
  const researchRows = database.prepare("SELECT * FROM research_experiences WHERE version_id = ? AND employee_id = ? ORDER BY id ASC").all(versionId, employeeId) as Record<string, unknown>[];
  return {
    ...employeeFromRow(row), versionId,
    workExperiences: workRows.map((work) => ({ employeeId, company: String(work.company), title: String(work.title), startDate: String(work.start_date), endDate: work.end_date as string | null, current: work.current === null ? work.end_date === null : Boolean(work.current), description: String(work.description) })),
    educations: educationRows.map((education) => ({ employeeId, school: String(education.school), major: String(education.major), startDate: String(education.start_date), endDate: education.end_date as string | null, current: education.current === null ? education.end_date === null : Boolean(education.current), degree: String(education.degree) })),
    researchExperiences: researchRows.map(research => ({ employeeId, heading: String(research.heading), description: String(research.description) })),
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
  return publishData(data, actor, false);
}

export function appendEmployeeData(data: ParsedEmployeeData, actor: ImportActor): EmployeeDataVersionSummary {
  return publishData(data, actor, true);
}

function publishData(data: ParsedEmployeeData, actor: ImportActor, append: boolean): EmployeeDataVersionSummary {
  const database = getDatabase();
  const importedAt = new Date().toISOString();
  const id = createVersionId(importedAt);
  database.exec("BEGIN IMMEDIATE");
  try {
    const active = append ? getEmployeeDataOverview().activeVersion : null;
    if (active) {
      for (const employee of data.employees) {
        const duplicate = database.prepare("SELECT employee_id FROM employees WHERE version_id = ? AND (employee_id = ? OR (? <> '' AND lower(email) = lower(?)) OR (? <> '' AND profile_url = ?))").get(active.id, employee.employeeId, employee.email, employee.email, employee.profileUrl ?? "", employee.profileUrl ?? "");
        if (duplicate) throw new EmployeeImportConflict("员工编号或邮箱已存在，请核对；本次未覆盖已有员工。");
      }
    }
    const seenIds = new Set<string>();
    const seenEmails = new Set<string>();
    const seenUrls = new Set<string>();
    for (const employee of data.employees) {
      const email = employee.email.toLowerCase();
      const url = employee.profileUrl ?? "";
      if (seenIds.has(employee.employeeId) || (email && seenEmails.has(email)) || (url && seenUrls.has(url))) throw new EmployeeImportConflict("本批次中存在重复的员工编号、邮箱或主页链接，请核对。");
      seenIds.add(employee.employeeId);
      if (email) seenEmails.add(email);
      if (url) seenUrls.add(url);
    }
    const employeeCount = (active?.employeeCount ?? 0) + data.employees.length;
    const workCount = (active?.workExperienceCount ?? 0) + data.workExperiences.length;
    const educationCount = (active?.educationCount ?? 0) + data.educationExperiences.length;
    database.prepare(`
      INSERT INTO employee_data_versions (
        id, status, imported_at, imported_by_id, imported_by_name,
        employee_count, work_experience_count, education_count
      ) VALUES (?, 'ARCHIVED', ?, ?, ?, ?, ?, ?)
    `).run(
      id, importedAt, actor.id, actor.displayName, employeeCount,
      workCount, educationCount,
    );
    if (active) {
      database.prepare(`INSERT INTO employees (version_id, employee_id, name, email, current_department, current_title, profile_url, warnings_json, resume_text, resume_fingerprint)
        SELECT ?, employee_id, name, email, current_department, current_title, profile_url, warnings_json, resume_text, resume_fingerprint FROM employees WHERE version_id = ?`).run(id, active.id);
      database.prepare(`INSERT INTO work_experiences (version_id, employee_id, company, title, start_date, end_date, current, description)
        SELECT ?, employee_id, company, title, start_date, end_date, current, description FROM work_experiences WHERE version_id = ?`).run(id, active.id);
      database.prepare(`INSERT INTO education_experiences (version_id, employee_id, school, major, start_date, end_date, current, degree)
        SELECT ?, employee_id, school, major, start_date, end_date, current, degree FROM education_experiences WHERE version_id = ?`).run(id, active.id);
      database.prepare(`INSERT INTO research_experiences (version_id, employee_id, heading, description)
        SELECT ?, employee_id, heading, description FROM research_experiences WHERE version_id = ? ORDER BY id`).run(id, active.id);
    }
    const employeeStatement = database.prepare(`
      INSERT INTO employees (
        version_id, employee_id, name, email, current_department, current_title, profile_url, warnings_json, resume_text, resume_fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const employee of data.employees) {
      employeeStatement.run(
        id, employee.employeeId, employee.name, employee.email,
        employee.currentDepartment, employee.currentTitle, employee.profileUrl ?? "", JSON.stringify(employee.warnings ?? []), employee.sourceText ?? "", employee.resumeFingerprint ?? "",
      );
    }
    const workStatement = database.prepare(`
      INSERT INTO work_experiences (
        version_id, employee_id, company, title, start_date, end_date, current, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const experience of data.workExperiences) {
      workStatement.run(
        id, experience.employeeId, experience.company, experience.title,
        experience.startDate, experience.endDate, experience.current === undefined ? null : Number(experience.current), experience.description ?? "",
      );
    }
    const educationStatement = database.prepare(`
      INSERT INTO education_experiences (
        version_id, employee_id, school, major, start_date, end_date, current, degree
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const education of data.educationExperiences) {
      educationStatement.run(
        id, education.employeeId, education.school, education.major,
        education.startDate, education.endDate, education.current === undefined ? null : Number(education.current), education.degree ?? "",
      );
    }
    const researchStatement = database.prepare("INSERT INTO research_experiences (version_id, employee_id, heading, description) VALUES (?, ?, ?, ?)");
    for (const research of data.researchExperiences ?? []) {
      researchStatement.run(id, research.employeeId, research.heading, research.description);
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
    return { id, importedAt, importedBy: actor.displayName, employeeCount, workExperienceCount: workCount, educationCount };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}




export function deleteEmployees(versionId: string, employeeIds: string[] | null, actor: ImportActor): EmployeeDataVersionSummary {
  const database = getDatabase();
  const importedAt = new Date().toISOString();
  const id = createVersionId(importedAt);
  database.exec("BEGIN IMMEDIATE");
  try {
    const active = getEmployeeDataOverview().activeVersion;
    if (!active || active.id !== versionId) throw new EmployeeImportConflict("员工库已更新，请刷新列表后重新选择。");
    const idsJson = JSON.stringify(employeeIds ?? []);
    if (employeeIds) {
      const count = database.prepare("SELECT COUNT(*) AS count FROM employees WHERE version_id = ? AND employee_id IN (SELECT value FROM json_each(?))").get(versionId, idsJson) as { count: number };
      if (count.count !== employeeIds.length) throw new EmployeeImportConflict("部分员工已不存在，请刷新列表后重新选择。");
    }
    database.prepare(`INSERT INTO employee_data_versions (id, status, imported_at, imported_by_id, imported_by_name, employee_count, work_experience_count, education_count) VALUES (?, 'ARCHIVED', ?, ?, ?, 0, 0, 0)`).run(id, importedAt, actor.id, actor.displayName);
    if (employeeIds) {
      database.prepare(`INSERT INTO employees (version_id, employee_id, name, email, current_department, current_title, profile_url, warnings_json, resume_text, resume_fingerprint)
      SELECT ?, employee_id, name, email, current_department, current_title, profile_url, warnings_json, resume_text, resume_fingerprint FROM employees WHERE version_id = ? AND employee_id NOT IN (SELECT value FROM json_each(?))`).run(id, versionId, idsJson);
      database.prepare(`INSERT INTO work_experiences (version_id, employee_id, company, title, start_date, end_date, current, description)
      SELECT ?, employee_id, company, title, start_date, end_date, current, description FROM work_experiences WHERE version_id = ? AND employee_id NOT IN (SELECT value FROM json_each(?))`).run(id, versionId, idsJson);
      database.prepare(`INSERT INTO education_experiences (version_id, employee_id, school, major, start_date, end_date, current, degree)
      SELECT ?, employee_id, school, major, start_date, end_date, current, degree FROM education_experiences WHERE version_id = ? AND employee_id NOT IN (SELECT value FROM json_each(?))`).run(id, versionId, idsJson);
      database.prepare(`INSERT INTO research_experiences (version_id, employee_id, heading, description)
      SELECT ?, employee_id, heading, description FROM research_experiences WHERE version_id = ? AND employee_id NOT IN (SELECT value FROM json_each(?)) ORDER BY id`).run(id, versionId, idsJson);
    }
    database.prepare(`UPDATE employee_data_versions SET employee_count = (SELECT COUNT(*) FROM employees WHERE version_id = ?), work_experience_count = (SELECT COUNT(*) FROM work_experiences WHERE version_id = ?), education_count = (SELECT COUNT(*) FROM education_experiences WHERE version_id = ?) WHERE id = ?`).run(id, id, id, id);
    database.prepare("UPDATE employee_data_versions SET status = 'ARCHIVED' WHERE id = ?").run(versionId);
    database.prepare("UPDATE employee_data_versions SET status = 'ACTIVE' WHERE id = ?").run(id);
    database.prepare("INSERT INTO audit_events (id, actor_id, action_type, resource_ref, outcome, created_at) VALUES (?, ?, 'EMPLOYEE_DATA_DELETE', ?, 'PUBLISHED', ?)").run(crypto.randomUUID(), actor.id, id, importedAt);
    const version = mapVersion(database.prepare("SELECT * FROM employee_data_versions WHERE id = ?").get(id) as Record<string, unknown>);
    database.exec("COMMIT");
    return version;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}
