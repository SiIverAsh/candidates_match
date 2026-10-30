import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { parseEmployeeWorkbook } from "../src/modules/employee-data/infrastructure/excel/parse-workbook";

const headers = {
  人员: ["记录ID", "复核状态", "文件状态", "姓名", "邮箱", "当前部门", "当前职位候选", "解析提示", "原文件", "源文件SHA256"],
  工作经历: ["记录ID", "经历序号", "员工草稿包含", "公司原文", "职位", "开始日期", "开始精度", "结束日期", "结束精度", "任职状态", "工作描述"],
  教育经历: ["记录ID", "经历序号", "员工草稿包含", "学校原文", "专业原文", "学位", "开始日期", "开始精度", "结束日期", "结束精度", "就读状态"],
  研究经历: ["记录ID", "章节序号", "章节标题", "研究正文"],
  需处理: ["记录ID", "解析与校验提示"],
  原文段落: ["记录ID", "段落名称", "片段序号", "段落原文", "对应表", "对应字段", "来源序号"],
};
function fixture(): ExcelJS.Workbook {
  const book = new ExcelJS.Workbook();
  for (const [name, columns] of Object.entries(headers)) book.addWorksheet(name).addRow(columns);
  book.getWorksheet("人员")!.addRows([
    ["a", "未复核", "valid", "同名", "same@example.test", "", "", "源警告", "a.pdf", "hash-a"],
    ["b", "未复核", "valid", "同名", "other@example.test", "", "", "", "b.pdf", "hash-b"],
  ]);
  book.getWorksheet("工作经历")!.addRow(["b", 0, "是", "原始公司", "工程师", "2019", "YEAR", "", "UNKNOWN", "未标注/未知", "原样\n描述"]);
  book.getWorksheet("教育经历")!.addRow(["b", 0, "是", "原始学校", "原始专业", "硕士", "2015-09", "MONTH", "2018-06", "MONTH", "有结束日期"]);
  book.getWorksheet("研究经历")!.addRow(["a", 0, "研究经历", "研究正文\n第二行"]);
  book.getWorksheet("需处理")!.addRow(["a", "具体人工核对说明"]);
  return book;
}
async function parse(book: ExcelJS.Workbook) {
  const bytes = await book.xlsx.writeBuffer();
  const array = Uint8Array.from(new Uint8Array(bytes)).buffer;
  return parseEmployeeWorkbook(array);
}
const ok = await parse(fixture());
assert.equal(ok.format, "standardized");
assert.equal(ok.totalIssueCount, 0);
assert.deepEqual(ok.summary, { totalEmployees: 2, workExperienceCount: 1, educationCount: 1, researchCount: 1 });
assert.equal(ok.data!.employees.length, 2);
assert.equal(ok.data!.workExperiences[0].employeeId, "b");
assert.equal(ok.data!.workExperiences[0].startDate, "2019");
assert.equal(ok.data!.workExperiences[0].current, false);
assert.equal(ok.data!.workExperiences[0].description, "原样\n描述");
assert.equal(ok.data!.educationExperiences[0].major, "原始专业");
assert.equal(ok.data!.educationExperiences[0].degree, "硕士");
assert.equal(ok.data!.researchExperiences?.[0].description, "研究正文\n第二行");
assert.match(ok.data!.employees[0].sourceText!, /具体人工核对说明/u);
assert.match(ok.data!.employees[0].sourceText!, /hash-a/u);
assert.ok(ok.data!.employees[0].warnings?.includes("源警告"));
const tests: Array<[string, (book: ExcelJS.Workbook) => void, string, string, number]> = [
  ["formula", b => { b.getWorksheet("研究经历")!.getCell("D2").value = { formula: '"bad"', result: "bad" }; }, "FORMULA_NOT_ALLOWED", "研究经历", 2],
  ["orphan", b => { b.getWorksheet("工作经历")!.getCell("A2").value = "missing"; }, "UNKNOWN_EMPLOYEE_ID", "工作经历", 2],
  ["duplicate person", b => { b.getWorksheet("人员")!.getCell("A3").value = "a"; }, "DUPLICATE_EMPLOYEE_ID", "人员", 3],
  ["duplicate sequence", b => { b.getWorksheet("研究经历")!.addRow(["a", 0, "研究", "其他内容"]); }, "DUPLICATE_SEQUENCE", "研究经历", 3],
  ["missing institution", b => { b.getWorksheet("工作经历")!.getCell("D2").value = ""; b.getWorksheet("工作经历")!.getCell("C2").value = "否"; }, "INVALID_VALUE", "工作经历", 2],
  ["excluded experience", b => { b.getWorksheet("工作经历")!.getCell("C2").value = "否"; }, "EXPERIENCE_REQUIRES_REVIEW", "工作经历", 2],
  ["precision", b => { b.getWorksheet("工作经历")!.getCell("G2").value = "MONTH"; }, "INVALID_DATE_PRECISION", "工作经历", 2],
  ["reversed dates", b => { b.getWorksheet("教育经历")!.getCell("F2").value = "2020"; b.getWorksheet("教育经历")!.getCell("G2").value = "YEAR"; }, "INVALID_VALUE", "教育经历", 2],
  ["unreadable", b => { b.getWorksheet("人员")!.getCell("C2").value = "unreadable"; }, "SOURCE_NOT_READ", "人员", 2],
  ["duplicate email", b => { b.getWorksheet("人员")!.getCell("E3").value = "same@example.test"; }, "DUPLICATE_EMAIL", "人员", 3],
  ["research count", b => { b.getWorksheet("人员")!.getCell("K1").value = "研究章节数"; b.getWorksheet("人员")!.getCell("K2").value = 1; b.getWorksheet("人员")!.getCell("K3").value = 0; b.removeWorksheet(b.getWorksheet("研究经历")!.id); }, "EXPERIENCE_COUNT_MISMATCH", "人员", 2],
  ["research version without sheet or count", b => { b.getWorksheet("人员")!.getCell("K1").value = "解析器版本"; b.getWorksheet("人员")!.getCell("K2").value = "resume-heuristic-v20"; b.removeWorksheet(b.getWorksheet("研究经历")!.id); }, "MISSING_HEADER", "人员", 1],
];
for (const [label, mutate, code, sheet, row] of tests) {
  const book = fixture(); mutate(book); const result = await parse(book);
  assert.equal(result.data, null, label);
  assert.ok(result.issues.some(issue => issue.code === code && issue.sheet === sheet && issue.row === row), label);
  assert.ok(result.summary && result.summary.totalEmployees === 2, label);
}
const chunks = fixture();
chunks.getWorksheet("研究经历")!.getCell("D2").value = "完整值见原文段落：研究经历/研究正文，来源序号 0";
chunks.getWorksheet("原文段落")!.addRows([["a", "超长字段", 1, "第一段\n", "研究经历", "研究正文", 0], ["a", "超长字段", 2, "第二段", "研究经历", "研究正文", 0]]);
const chunked = await parse(chunks);
assert.equal(chunked.totalIssueCount, 0);
assert.equal(chunked.data!.researchExperiences![0].description, "第一段\n第二段");
chunks.getWorksheet("原文段落")!.getCell("C3").value = 3;
assert.ok((await parse(chunks)).issues.some(issue => issue.code === "MISSING_TEXT_CHUNK"));
const old = new ExcelJS.Workbook();
old.addWorksheet("Employees").addRows([["employee_id", "name", "email", "current_department", "current_title"], ["x", "测试", "test@example.test", "部门", "职位"]]);
old.addWorksheet("WorkExperience").addRows([["employee_id", "company", "title", "start_date", "end_date"], ["x", "公司", "职位", "2020-01-01", ""]]);
old.addWorksheet("Education").addRows([["employee_id", "school", "major", "start_date", "end_date"], ["x", "学校", "专业", "2010-01-01", "2014-01-01"]]);
const legacy = await parse(old);
assert.equal(legacy.format, "legacy"); assert.equal(legacy.totalIssueCount, 0);
console.log("Standardized join, research-only, metadata, date precision, atomic failures and legacy routing verified.");
