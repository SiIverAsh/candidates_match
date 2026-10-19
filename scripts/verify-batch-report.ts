import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { batchReportApplication } from "../src/modules/candidate-batch/browser-composition";
import type { BatchEmployeeContact, BatchItemResult } from "../src/modules/candidate-batch/domain/models";
import { prepareBatchReport } from "../src/modules/candidate-batch/domain/report";

const contacts: BatchEmployeeContact[] = ["LOW", "MEDIUM", "HIGH", "HIGH", "HIGH", "HIGH"].map((confidence, index) => ({
  employeeId: `E${index}`, name: index === 0 ? '=HYPERLINK("https://example.com")' : `员工${index}`,
  email: `employee${index}@example.com`, currentDepartment: "肿瘤与免疫学研究部", currentTitle: "研究员",
  confidence: confidence as BatchEmployeeContact["confidence"], score: 50, rank: index + 1,
}));
const statuses = ["MATCHED", "NO_RESULTS", "NEEDS_INPUT", "NEEDS_DATA", "FAILED", "IMPORTED"] as const;
const items: BatchItemResult[] = statuses.map((status, index) => ({
  index, label: `来源行${index + 2}`, queryId: status === "FAILED" ? null : `q${index}`, status,
  message: `处理说明${index}`, resultCount: index === 0 ? contacts.length : 0,
  workbookRow: { sheetName: index % 2 ? "肿瘤研发" : "免疫学", rowNumber: index + 2, candidateName: "同名候选人" },
  employeeContacts: index === 0 ? contacts : status === "NO_RESULTS" ? [] : undefined,
}));
const report = { sourceName: "候选人.xlsx", total: items.length, items: [...items].reverse() };
const before = JSON.stringify(report);
const bytes = await batchReportApplication.export(report);
assert.equal(JSON.stringify(report), before, "导出不得改变原始匹配结果与排序");
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(bytes.buffer);
assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ["候选人匹配汇总", "员工明细"]);
const summary = workbook.getWorksheet("候选人匹配汇总")!;
const details = workbook.getWorksheet("员工明细")!;
assert.equal(summary.rowCount, 10);
assert.equal(details.rowCount, 10);
assert.equal(summary.getCell("A5").value, 1);
assert.equal(summary.getCell("B6").value, "肿瘤研发");
assert.equal(summary.getCell("C6").value, 3);
assert.equal(summary.getCell("D6").value, "同名候选人");
assert.match(String(summary.getCell("F5").value), /共 4 位，完整名单见员工明细/);
assert.match(String(summary.getCell("G5").value), /员工1｜employee1@example.com/);
assert.equal(summary.getCell("F6").value, "无");
assert.equal(summary.getCell("F7").value, "未完成匹配");
assert.equal(summary.getCell("E8").value, "等待员工数据");
assert.equal(summary.getCell("E9").value, "处理失败");
assert.equal(summary.getCell("I9").value, "处理说明4");
assert.equal(details.getCell("E5").value, "高置信度");
assert.equal(details.getCell("E9").value, "中置信度");
assert.equal(details.getCell("E10").value, "低置信度");
assert.equal(details.getCell("F10").value, contacts[0].name);
assert.equal(details.getCell("F10").type, ExcelJS.ValueType.String, "以等号开头的姓名必须保存为文字，不能执行为公式");
assert.deepEqual(Array.from({ length: 6 }, (_, i) => details.getCell(i + 5, 7).value).sort(), contacts.map(item => item.email).sort());
assert.equal(summary.views[0].state, "frozen");
assert.ok(summary.autoFilter);

const partial = new ExcelJS.Workbook();
await partial.xlsx.load((await batchReportApplication.export({ ...report, items: [items[0]] })).buffer);
assert.match(String(partial.getWorksheet(1)!.getCell("A2").value), /部分结果：已处理 1 \/ 6/);
const empty = new ExcelJS.Workbook();
await empty.xlsx.load((await batchReportApplication.export({ ...report, items: [items[1]] })).buffer);
assert.match(String(empty.getWorksheet("员工明细")!.getCell("F5").value), /暂无可导出的匹配员工/);
assert.throws(() => prepareBatchReport({ ...report, items: [{ ...items[0], employeeContacts: undefined }] }), /匹配明细不完整/);
assert.throws(() => prepareBatchReport({ ...report, items: [items[0], items[0]] }), /原始 Excel 行信息/);
assert.throws(() => prepareBatchReport({ ...report, items: [] }), /没有可导出/);
console.log("Batch report verification passed: all confidence tiers and contacts, source rows, failures, partial results, formula safety, and complete detail export.");
