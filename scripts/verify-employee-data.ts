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

const flat = new ExcelJS.Workbook();
const headers = ["姓名", "当前职位", "当前公司", "LinkedIn Public URL", "完整工作经历", "完整教育经历"];
const flatRow = ["合成人员", "Scientist", "示例药企", "https://www.linkedin.com/in/synthetic-employee", "职业档案中列出的工作经历 | Scientist at 示例药企 · 2020年 - 现在 | Research Assistant at Example University · 2017年 - 2019年", "职业档案中列出的教育经历 | Example University，Doctor of Philosophy (Ph.D.) · 2012年 - 2017年 | 示例大学，学士 | 档案分析行 | 最新动态"];
flat.addWorksheet("总表").addRows([headers, flatRow]);
flat.addWorksheet("公司分表").addRows([headers, flatRow]);
const flatResult = await parseEmployeeWorkbook(toArrayBuffer(await flat.xlsx.writeBuffer() as unknown as Uint8Array));
assert.equal(flatResult.totalIssueCount, 0, JSON.stringify(flatResult.issues));
assert.equal(flatResult.data?.employees.length, 1, "总表和分表按来源去重");
assert.equal(flatResult.data?.employees[0].email, "", "不得编造邮箱");
assert.equal(flatResult.data?.employees[0].currentDepartment, "");
assert.ok(flatResult.data?.employees[0].employeeId.startsWith("record-"));
assert.equal(flatResult.data?.workExperiences.length, 2);
assert.equal(flatResult.data?.workExperiences[0].startDate, "2020", "保留年份精度");
assert.equal(flatResult.data?.workExperiences[0].current, true);
assert.equal(flatResult.data?.educationExperiences.length, 2);
assert.equal(flatResult.data?.educationExperiences[0].degree, "Doctor of Philosophy (Ph.D.)");
assert.equal(flatResult.data?.educationExperiences[1].current, false, "未知日期不视为当前");
assert.equal(flatResult.data?.educationExperiences[1].startDate, "");
assert.match(flatResult.warnings?.[0] ?? "", /合并 1 条/);
const flatVersion = repository.publishEmployeeData(flatResult.data!, actor);
const savedProfile = repository.findEmployeeProfile(flatResult.data!.employees[0].employeeId, flatVersion.id)!;
assert.equal(savedProfile.workExperiences[0].startDate, "2020");
assert.equal(savedProfile.educations.find(item => item.school === "示例大学")?.current, false);
assert.match(savedProfile.sourceText ?? "", /完整工作经历/);

const appended = repository.appendEmployeeData({
  employees: [{ employeeId: "no-email-student", name: "教育经历测试", email: "", currentDepartment: "", currentTitle: "" }],
  workExperiences: [], educationExperiences: [{ employeeId: "no-email-student", school: "另一大学", major: "", degree: "本科", startDate: "2018", endDate: null, current: false }],
}, actor);
assert.equal(appended.employeeCount, 2, "不同人员的空邮箱不能导致重复冲突，追加也不能覆盖已有员工");
assert.ok(repository.findEmployeeProfile(flatResult.data!.employees[0].employeeId, appended.id)?.sourceText);

console.log(JSON.stringify({
  validTemplate: true,
  duplicateRejected: true,
  failedPublishRolledBack: true,
  activeVersion: firstVersion.id,
}));

