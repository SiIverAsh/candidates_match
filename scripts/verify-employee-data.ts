import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import ExcelJS from "exceljs";

process.env.CONNECTION_FINDER_DB_PATH = ":memory:";

const [{ parseEmployeeWorkbook }, repository] = await Promise.all([
  import("../src/modules/employee-data/infrastructure/excel/parse-workbook"),
  import("../src/modules/employee-data/infrastructure/sqlite/repository"),
]);

function toArrayBuffer(buffer: Uint8Array): ArrayBuffer {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

const templatePath = path.join(
  process.cwd(),
  "assets",
  "templates",
  "employee_import_template.xlsx",
);
const template = await readFile(templatePath);
const validResult = await parseEmployeeWorkbook(toArrayBuffer(template));
assert.equal(validResult.totalIssueCount, 0, JSON.stringify(validResult.issues));
assert.ok(validResult.data);
assert.equal(validResult.data.employees.length, 1);
assert.equal(validResult.data.workExperiences.length, 1);
assert.equal(validResult.data.educationExperiences.length, 1);

const actor = {
  id: "test-user",
  name: "test",
  displayName: "Test Admin",
  role: "HR_ADMIN" as const,
};
const firstVersion = repository.publishEmployeeData(validResult.data, actor);
assert.equal(repository.getEmployeeDataOverview().activeVersion?.id, firstVersion.id);

const duplicateWorkbook = new ExcelJS.Workbook();
const employeesSheet = duplicateWorkbook.addWorksheet("Employees");
employeesSheet.addRow(["employee_id", "name", "email", "current_department", "current_title"]);
employeesSheet.addRow(["E0001", "张三", "zhangsan@example.com", "商业化", "区域经理"]);
employeesSheet.addRow([
  "E0001",
  "重复员工",
  "duplicate@example.com",
  "医学部",
  "经理",
]);
const workSheet = duplicateWorkbook.addWorksheet("WorkExperience");
workSheet.addRow(["employee_id", "company", "title", "start_date", "end_date"]);
workSheet.addRow(["E0001", "示例公司", "销售主管", "2020-01-01", null]);
const educationSheet = duplicateWorkbook.addWorksheet("Education");
educationSheet.addRow(["employee_id", "school", "major", "start_date", "end_date"]);
educationSheet.addRow(["E0001", "示例大学", "市场营销", "2016-09-01", "2020-06-30"]);
const duplicateBytes = await duplicateWorkbook.xlsx.writeBuffer();
const duplicateResult = await parseEmployeeWorkbook(
  toArrayBuffer(duplicateBytes as unknown as Uint8Array),
);
assert.equal(duplicateResult.data, null);
assert.ok(duplicateResult.issues.some((issue) => issue.code === "DUPLICATE_EMPLOYEE_ID"));
assert.equal(repository.getEmployeeDataOverview().activeVersion?.id, firstVersion.id);

assert.throws(() => repository.publishEmployeeData({
  employees: [{
    employeeId: "E0002",
    name: "李四",
    email: "lisi@example.com",
    currentDepartment: "医学部",
    currentTitle: "医学经理",
  }],
  workExperiences: [{
    employeeId: "UNKNOWN",
    company: "示例公司",
    title: "经理",
    startDate: "2021-01-01",
    endDate: null,
  }],
  educationExperiences: [{
    employeeId: "E0002",
    school: "示例大学",
    major: "医学",
    startDate: "2015-09-01",
    endDate: "2020-06-30",
  }],
}, actor));
assert.equal(repository.getEmployeeDataOverview().activeVersion?.id, firstVersion.id);

repository.recordFailedImport(actor, "PUBLISH_FAILED", 1);
const finalOverview = repository.getEmployeeDataOverview();
assert.equal(finalOverview.activeVersion?.id, firstVersion.id);
assert.equal(finalOverview.recentAttempts[0]?.status, "FAILED");
assert.equal(finalOverview.recentAttempts[1]?.versionId, firstVersion.id);

console.log(JSON.stringify({
  validTemplate: true,
  duplicateRejected: true,
  failedPublishRolledBack: true,
  activeVersion: firstVersion.id,
}));

