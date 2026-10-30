import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import ExcelJS from "exceljs";
import { importEmployeeResumes } from "../src/modules/employee-data/application/import-employee-resume";
import { importEmployeeWorkbook } from "../src/modules/employee-data/application/import-employee-workbook";
import { mergeEmployeeDraft } from "../src/modules/employee-data/domain/merge-employee-drafts";
import { validateEmployeeResume, type EmployeeResumeDraft } from "../src/modules/employee-data/domain/resume-import";
import { employeeResumeDraftSchema } from "../src/modules/employee-data/presentation/contracts";
import { appendEmployeeData, deleteEmployees, findEmployeeProfile, getEmployeeDataOverview, publishEmployeeData, recordFailedImport } from "../src/modules/employee-data/infrastructure/sqlite/repository";
import { parseEmployeeWorkbook } from "../src/modules/employee-data/infrastructure/excel/parse-workbook";

// Seed a disposable old-format database and never open the user's database.
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "research-storage-test-"));
const databasePath = path.join(temporaryDirectory, "test.sqlite");
const oldDatabase = new DatabaseSync(databasePath);
oldDatabase.exec(`
  CREATE TABLE employee_data_versions (id TEXT PRIMARY KEY, status TEXT NOT NULL, imported_at TEXT NOT NULL, imported_by_id TEXT NOT NULL, imported_by_name TEXT NOT NULL, employee_count INTEGER NOT NULL, work_experience_count INTEGER NOT NULL, education_count INTEGER NOT NULL);
  CREATE TABLE employees (version_id TEXT NOT NULL, employee_id TEXT NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, current_department TEXT NOT NULL, current_title TEXT NOT NULL, PRIMARY KEY (version_id, employee_id));
  INSERT INTO employee_data_versions VALUES ('old', 'ACTIVE', '2020-01-01', 'test', 'Test', 1, 0, 0);
  INSERT INTO employees VALUES ('old', 'old-employee', 'Legacy', '', '', '');
`);
oldDatabase.close();
process.env.CONNECTION_FINDER_DB_PATH = databasePath;
process.once("exit", () => {
  const globalDatabase = (globalThis as unknown as { employeeDataDatabase?: DatabaseSync }).employeeDataDatabase;
  globalDatabase?.close();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});
const actor = { id: "test", displayName: "Test" };
const repository = { append: appendEmployeeData, recordFailedImport };
const draft = (id: string): EmployeeResumeDraft => ({
  employee: { employeeId: id, name: `Test ${id}`, email: "", currentDepartment: "", currentTitle: "" },
  workExperiences: [], educations: [], warnings: [],
});
const first = draft("one");
first.researchExperiences = [{ heading: "Research", description: "Line one\nLine two" }];
const secondSource = draft("one");
secondSource.researchExperiences = [{ heading: "Research", description: "Line one\nLine two" }, { heading: "Projects", description: "Another project" }];
mergeEmployeeDraft(first, secondSource);
assert.equal(first.researchExperiences.length, 2);
assert.equal(validateEmployeeResume(first, "2026-10-30").length, 0);
assert.ok(validateEmployeeResume({ ...draft("empty"), researchExperiences: [] }, "2026-10-30").length);
assert.ok(validateEmployeeResume({ ...draft("heading"), researchExperiences: [{ heading: "Research", description: " " }] }, "2026-10-30").length);
assert.ok(employeeResumeDraftSchema.safeParse(first).success);

const published = importEmployeeResumes([first], actor, repository, "2026-10-30");
assert.equal(published.kind, "published");
if (published.kind !== "published") throw new Error("Import failed");
assert.equal(findEmployeeProfile("old-employee", published.version.id)?.name, "Legacy");
assert.deepEqual(findEmployeeProfile("old-employee", published.version.id)?.researchExperiences, []);
const saved = findEmployeeProfile("one", published.version.id);
assert.deepEqual(saved?.researchExperiences, first.researchExperiences.map(item => ({ ...item, employeeId: "one" })));
assert.deepEqual(saved?.workExperiences, []);
assert.deepEqual(saved?.educations, []);

// Legacy payloads without research still import and preserve previous research on append.
const legacy = draft("two");
legacy.workExperiences = [{ company: "Example Co", title: "Engineer", startDate: "", endDate: null }];
assert.ok(employeeResumeDraftSchema.safeParse(legacy).success);
const appended = importEmployeeResumes([legacy], actor, repository, "2026-10-30");
assert.equal(appended.kind, "published");
if (appended.kind !== "published") throw new Error("Append failed");
assert.deepEqual(findEmployeeProfile("one", appended.version.id)?.researchExperiences, saved?.researchExperiences);
const deleted = deleteEmployees(appended.version.id, ["two"], actor);
assert.deepEqual(findEmployeeProfile("one", deleted.id)?.researchExperiences, saved?.researchExperiences);
assert.equal(findEmployeeProfile("two", deleted.id), null);
const cleared = deleteEmployees(deleted.id, null, actor);
assert.equal(findEmployeeProfile("one", cleared.id), null);
// Real XLSX bytes through the flat workbook route and publication into SQLite.
const workbook = new ExcelJS.Workbook();
const worksheet = workbook.addWorksheet("员工");
worksheet.addRow(["姓名", "简历全文"]);
worksheet.addRow(["测试员工", "姓名：测试员工\n科研经历\n研究课题：材料实验\n负责材料制备与性能分析"]);
const workbookBytes = await workbook.xlsx.writeBuffer();
const workbookBuffer = new Uint8Array(workbookBytes).buffer;
const parsed = await parseEmployeeWorkbook(workbookBuffer);
assert.equal(parsed.totalIssueCount, 0);
assert.ok(parsed.data);
assert.equal(parsed.data.workExperiences.length, 0);
assert.equal(parsed.data.educationExperiences.length, 0);
assert.equal(parsed.data.researchExperiences?.length, 1);
assert.match(parsed.data.researchExperiences[0].description, /材料制备与性能分析/u);
const imported = await importEmployeeWorkbook({ actor, file: { name: "research.xlsx", size: workbookBuffer.byteLength, async arrayBuffer() { return workbookBuffer; } } }, { parser: { parse: parseEmployeeWorkbook }, repository: { getOverview: getEmployeeDataOverview, publishEmployeeData, recordFailedImport } });
assert.equal(imported.kind, "published");
if (imported.kind !== "published") throw new Error("Workbook import failed");
const workbookEmployee = findEmployeeProfile(parsed.data.employees[0].employeeId, imported.version.id);
assert.deepEqual(workbookEmployee?.researchExperiences, parsed.data.researchExperiences);
assert.deepEqual(workbookEmployee?.workExperiences, []);
assert.deepEqual(workbookEmployee?.educations, []);
console.log("Research storage: old-schema migration, validation, merge, resume and XLSX import, persistence, append and deletion passed (temporary database).");
