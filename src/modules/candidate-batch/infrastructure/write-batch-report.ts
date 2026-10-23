import ExcelJS from "exceljs";
import type { BatchReportWriter } from "../application/ports";
import { BATCH_STATUS_LABELS } from "../domain/report";
import type { BatchEmployeeContact } from "../domain/models";

const CONFIDENCE = { HIGH: "高置信度", MEDIUM: "中置信度", LOW: "低置信度" } as const;
const ORDER = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const COLORS = { HIGH: "E2F0D9", MEDIUM: "FFF2CC", LOW: "DDEBF7" };
const FUNCTION_STATUS = { CLASSIFIED: "已有优先职能", AMBIGUOUS: "方向接近，待复核", INSUFFICIENT: "证据不足" } as const;
const EVIDENCE_KIND = { STRONG: "强关键词", SUPPORTING: "辅助关键词", TITLE: "职位关键词", NEGATIVE: "排除关键词" } as const;
const SIMILARITY = { SAME_CATEGORY: "存在大类相同的职位", DIFFERENT_CATEGORY: "已识别的职位大类不同", UNKNOWN: "信息不足" } as const;

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
      ["批内序号", "来源工作表 / 简历文件", "原始行号", "候选人姓名", "处理状态", "高置信度员工 / 邮箱", "中置信度员工 / 邮箱", "低置信度员工 / 邮箱", "处理说明", "职能判断", "职能优先级 / 置信度", "职能判断依据"],
      [10, 20, 12, 20, 20, 44, 44, 44, 50, 24, 60, 60],
      `来源：${report.sourceName}。${completion}。每档预览前 3 位，完整名单见员工明细；联系方式为员工库邮箱。推荐仅表示可能认识。`);
    let detailNumber = 1;
    function createDetails() {
      return sheet(workbook, detailNumber === 1 ? "员工明细" : `员工明细${detailNumber}`,
        ["批内序号", "来源工作表 / 简历文件", "原始行号", "候选人姓名", "关系置信度", "内部员工姓名", "联系邮箱", "部门", "职位", "匹配总分", "经历证据分", "职能辅助加分", "职能相似度", "职能比较依据"],
        [10, 20, 12, 20, 16, 20, 38, 28, 30, 12, 14, 14, 30, 80],
        "每行是一位候选人与一位内部员工的匹配关系，保留全部匹配员工；经历证据与职能辅助加分分别列出，总分上限 100 分。部门仅供展示，不参与匹配。");
    }
    let details = createDetails();
    let functionSheetNumber = 1;
    function createFunctionDetails() {
      return sheet(workbook, functionSheetNumber === 1 ? "职能依据" : `职能依据${functionSheetNumber}`,
        ["批内序号", "来源工作表 / 简历文件", "原始行号", "候选人姓名", "职能判断", "优先级", "职能", "职能分数", "职能置信度", "工作单位", "职位", "经历时间", "证据类型", "命中关键词", "证据分数", "原文依据", "计分说明", "归类说明", "词库 / 规则版本"],
        [10, 20, 12, 20, 24, 10, 55, 12, 16, 45, 35, 25, 16, 30, 12, 80, 55, 60, 32],
        "范围仅限药物发现阶段 Research；按同段工作内容评分，分数不是准确率。每行保留一条命中或未计分证据；职能置信度与员工关系置信度分别展示。");
    }
    let functionDetails = createFunctionDetails();
    function addFunctionRow(values: (string | number)[]) {
      if (functionDetails.rowCount === 1_048_576) { functionSheetNumber++; functionDetails = createFunctionDetails(); }
      addRow(functionDetails, values, 36);
    }
    for (const item of report.items) {
      const source = item.workbookRow;
      const contacts = [...(item.employeeContacts ?? [])].sort((a, b) => ORDER[a.confidence] - ORDER[b.confidence] || a.rank - b.rank);
      const identity = [item.index + 1, source?.sheetName ?? item.sourceFileName!, source?.rowNumber ?? "", source?.candidateName ?? item.candidateName ?? item.label];
      const matched = item.status === "MATCHED" || item.status === "NO_RESULTS";
      const assessment = item.candidateFunctions;
      const functionStatus = assessment ? FUNCTION_STATUS[assessment.status] : "职能信息暂不可用";
      const priorities = assessment?.priorities.map(priority => `${priority.rank}. ${priority.name}｜${priority.score} 分｜${CONFIDENCE[priority.confidence]}${priority.eligible ? "" : "｜未达归类条件"}`).join("\n") ?? "";
      const reference = assessment?.source;
      const referenceText = reference ? `第 ${reference.sequence + 1} 段工作：${reference.company ?? "单位未知"}；${reference.title ?? "职位未知"}；${reference.start ?? "?"}—${reference.current ? "至今" : reference.end ?? "?"}` : "";
      addRow(summary, [...identity, BATCH_STATUS_LABELS[item.status], preview(contacts, "HIGH", matched), preview(contacts, "MEDIUM", matched), preview(contacts, "LOW", matched), item.message, functionStatus, priorities, assessment ? `${assessment.summary}\n${referenceText}\n逐条原文见“职能依据”表` : "请检查本条简历的处理状态，职能依据来自简历正文"], 36);
      if (!assessment?.priorities.length) addFunctionRow([...identity, functionStatus, "", "", "", "", "", "", "", "", "", "", "", "", assessment?.summary ?? "请检查本条简历的处理状态，职能依据来自简历正文"]);
      for (const priority of assessment?.priorities ?? []) {
        for (const evidence of priority.evidence) {
          addFunctionRow([...identity, functionStatus, priority.rank, priority.name, priority.score, CONFIDENCE[priority.confidence], reference?.company ?? "", reference?.title ?? "", reference ? `${reference.start ?? "?"}—${reference.current ? "至今" : reference.end ?? "?"}` : "", EVIDENCE_KIND[evidence.kind], evidence.keyword, evidence.points,
            evidence.excerpt.length > 32000 ? `${evidence.excerpt.slice(0, 32000)}（原文过长，完整内容见候选人详情）` : evidence.excerpt,
            `${evidence.sourceField === "title" ? "职位" : "工作内容"}：${evidence.explanation}`, priority.reasons.join("；"), `${assessment!.taxonomyVersion} / ${assessment!.ruleVersion}`]);
        }
      }
      for (const employee of contacts) {
        if (details.rowCount === 1_048_576) { detailNumber++; details = createDetails(); }
        const similarity = employee.functionSimilarity;
        const comparisonText = similarity?.comparisons.map(item => `${item.company}：${item.candidateTitle ?? "职位缺失"}（${item.candidateFunction ?? "未识别"}） / ${item.employeeTitle}（${item.employeeFunction ?? "未识别"}）；${item.reason} +${item.bonus} 分`).join("\n") ?? "";
        const row = addRow(details, [...identity, CONFIDENCE[employee.confidence], employee.name, employee.email || "未提供邮箱", employee.currentDepartment, employee.currentTitle, employee.score,
          employee.relationshipScore ?? "", similarity?.bonus ?? "", similarity ? SIMILARITY[similarity.status] : "未计算", comparisonText.slice(0, 32000)], 36);
        row.getCell(5).fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS[employee.confidence] } };
      }
    }
    if (details.rowCount === 4) addRow(details, ["", "", "", "", "", "本批暂无可导出的匹配员工，请查看汇总表中的处理状态与原因。"], 45);
    return new Uint8Array(await workbook.xlsx.writeBuffer());
  },
};
