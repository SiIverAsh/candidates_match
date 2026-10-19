import ExcelJS from "exceljs";
import type { BatchReportWriter } from "../application/ports";
import { BATCH_STATUS_LABELS } from "../domain/report";
import type { BatchEmployeeContact } from "../domain/models";

const CONFIDENCE = { HIGH: "高置信度", MEDIUM: "中置信度", LOW: "低置信度" } as const;
const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const COLORS = { HIGH: "E2F0D9", MEDIUM: "FFF2CC", LOW: "DDEBF7" };

function sheet(workbook: ExcelJS.Workbook, name: string, headers: string[], widths: number[], note: string) {
  const result = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 4, xSplit: 4 }] });
  result.columns = widths.map(width => ({ width }));
  result.mergeCells(1, 1, 1, headers.length);
  result.getCell(1, 1).value = name;
  result.getCell(1, 1).font = { name: "等线", size: 16, bold: true, color: { argb: "17365D" } };
  result.getRow(1).height = 30;
  result.mergeCells(2, 1, 2, headers.length);
  result.getCell(2, 1).value = note;
  result.getCell(2, 1).alignment = { wrapText: true, vertical: "middle" };
  result.getRow(2).height = 36;
  const header = result.getRow(4);
  header.values = headers;
  header.height = 30;
  header.eachCell(cell => {
    cell.font = { name: "等线", bold: true, color: { argb: "FFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "17365D" } };
    cell.alignment = { wrapText: true, vertical: "middle" };
  });
  result.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: headers.length } };
  return result;
}

function addRow(target: ExcelJS.Worksheet, values: (string | number)[], height: number) {
  const row = target.addRow(values);
  const lines = values.map((value, index) => String(value).split("\n").reduce((total, line) => {
    const units = Array.from(line).reduce((length, character) => length + (character.charCodeAt(0) > 255 ? 2 : 1), 0);
    return total + Math.max(1, Math.ceil(units / (target.getColumn(index + 1).width! - 2)));
  }, 0));
  row.height = Math.min(409, Math.max(height, Math.max(...lines) * 16 + 8));
  row.eachCell(cell => {
    cell.font = { name: "等线", size: 11 };
    cell.alignment = { wrapText: true, vertical: "top" };
    if (row.number % 2 === 1) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "F3F6FA" } };
  });
  return row;
}

function preview(contacts: BatchEmployeeContact[], confidence: BatchEmployeeContact["confidence"], matched: boolean) {
  if (!matched) return "未完成匹配";
  const group = contacts.filter(employee => employee.confidence === confidence);
  if (!group.length) return "无";
  const lines = group.slice(0, 3).map(employee => `${employee.name}｜${employee.email || "未提供邮箱"}`);
  if (group.length > 3) lines.push(`共 ${group.length} 位，完整名单见员工明细`);
  return lines.join("\n");
}

export const batchReportWriter: BatchReportWriter = {
  async write(report) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "候选人关系匹配";
    const completion = report.items.length === report.total ? `本批共 ${report.total} 位` : `部分结果：已处理 ${report.items.length} / ${report.total} 位，未处理项未包含在此表中`;
    const summary = sheet(workbook, "候选人匹配汇总",
      ["批内序号", "来源工作表", "原始行号", "候选人姓名", "处理状态", "高置信度员工 / 邮箱", "中置信度员工 / 邮箱", "低置信度员工 / 邮箱", "处理说明"],
      [10, 20, 12, 20, 20, 44, 44, 44, 50],
      `来源：${report.sourceName}。${completion}。每档预览前 3 位，完整名单见员工明细；联系方式为员工库邮箱。推荐仅表示可能认识。`);
    let detailNumber = 1;
    function createDetails() {
      return sheet(workbook, detailNumber === 1 ? "员工明细" : `员工明细${detailNumber}`,
        ["批内序号", "来源工作表", "原始行号", "候选人姓名", "置信度", "内部员工姓名", "联系邮箱", "部门", "职位", "匹配分数"],
        [10, 20, 12, 20, 16, 20, 38, 28, 30, 12],
        "每行是一位候选人与一位内部员工的匹配关系，保留全部匹配员工；同名候选人请按来源工作表、原始行号及批内序号区分。");
    }
    let details = createDetails();
    for (const item of report.items) {
      const source = item.workbookRow!;
      const contacts = [...(item.employeeContacts ?? [])].sort((a, b) => ORDER[a.confidence] - ORDER[b.confidence] || a.rank - b.rank);
      const identity = [item.index + 1, source.sheetName, source.rowNumber, source.candidateName];
      const matched = item.status === "MATCHED" || item.status === "NO_RESULTS";
      addRow(summary, [...identity, BATCH_STATUS_LABELS[item.status], preview(contacts, "HIGH", matched), preview(contacts, "MEDIUM", matched), preview(contacts, "LOW", matched), item.message], 36);
      for (const employee of contacts) {
        if (details.rowCount === 1_048_576) { detailNumber++; details = createDetails(); }
        const row = addRow(details, [...identity, CONFIDENCE[employee.confidence], employee.name, employee.email || "未提供邮箱", employee.currentDepartment, employee.currentTitle, employee.score], 36);
        row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS[employee.confidence] } };
      }
    }
    if (details.rowCount === 4) addRow(details, ["", "", "", "", "", "本批暂无可导出的匹配员工，请查看汇总表中的处理状态与原因。"], 45);
    return new Uint8Array(await workbook.xlsx.writeBuffer());
  },
};
