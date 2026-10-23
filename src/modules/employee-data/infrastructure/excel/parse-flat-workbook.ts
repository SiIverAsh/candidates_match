import type { Cell, Workbook } from "exceljs";
import { createHash } from "node:crypto";
import { parseResumeText } from "../../../resume-parser/infrastructure/parsing/parse-resume-text";
import { profileToEmployeeDraft } from "../../domain/profile-to-employee";
import { employeeWorkbookText, identifyEmployeeColumn, type EmployeeColumnMapping } from "../../domain/workbook-columns";
import { validateEmployeeResume, type EmployeeResumeDraft } from "../../domain/resume-import";
import { mergeEmployeeDraft } from "../../domain/merge-employee-drafts";
import type { ImportValidationIssue, ImportValidationResult } from "../../application/ports";

function cellText(cell: Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "richText" in value) return value.richText.map(item => item.text).join("").trim();
  if (typeof value === "object" && "hyperlink" in value) return String(value.text).trim();
  throw new Error("不接受公式或不支持的单元格类型，请将该列粘贴为纯值。");
}

function profileKey(value: string): string {
  // Tracking parameters do not identify a different LinkedIn profile.
  return value.trim().replace(/[?#].*$/u, "").replace(/\/$/u, "").toLowerCase();
}

export function parseFlatEmployeeWorkbook(workbook: Workbook): ImportValidationResult {
  const issues: ImportValidationIssue[] = [];
  let totalIssueCount = 0;
  const add = (issue: ImportValidationIssue) => { totalIssueCount++; if (issues.length < 200) issues.push(issue); };
  const drafts = new Map<string, EmployeeResumeDraft>();
  const ids = new Map<string, string>();
  let duplicates = 0;
  let tables = 0;
  const now = new Date().toISOString();
  for (const sheet of workbook.worksheets) {
    let columns: EmployeeColumnMapping[] = [];
    let headerRow = 0;
    for (let row = 1; row <= Math.min(20, sheet.rowCount); row++) {
      const detected: EmployeeColumnMapping[] = [];
      sheet.getRow(row).eachCell((cell, column) => {
        const label = typeof cell.value === "string" ? cell.value : cell.value && typeof cell.value === "object" && "richText" in cell.value ? cellText(cell) : "";
        const found = identifyEmployeeColumn(label);
        if (found) detected.push({ ...found, column });
      });
      if (detected.some(item => item.field === "name") && detected.some(item => ["work", "education", "resume", "company", "school", "currentCompany"].includes(item.field))) {
        columns = detected; headerRow = row; break;
      }
    }
    if (!headerRow) continue;
    tables++;
    const keys = columns.map(item => `${item.group}:${item.field}`);
    if (new Set(keys).size !== keys.length) {
      add({ sheet: sheet.name, row: headerRow, field: "表头", code: "DUPLICATE_COLUMN", message: "有多列含义相同，多段经历请标明公司1、公司2等序号。" });
      continue;
    }
    for (let row = headerRow + 1; row <= sheet.rowCount; row++) {
      try {
        const cells = columns.map(item => ({ ...item, text: cellText(sheet.getCell(row, item.column)) }));
        if (!cells.some(item => item.text)) continue;
        if (columns.some(item => sheet.getCell(row, item.column).isMerged)) throw new Error("员工资料含合并单元格，请拆开并逐行补齐。");
        const input = employeeWorkbookText(cells);
        if (!input.name) throw new Error("该行缺少员工姓名。");
        if (input.text.length > 200_000) throw new Error("该行简历文本过长，请缩减至 200,000 字符以内。");
        const profile = parseResumeText({ queryId: `${sheet.name}:${row}`, submittedBy: "employee-workbook", sourceType: "TEXT", sourceFormat: "plain-text", text: input.text, bytes: null, expiresAt: now }, input.text, now);
        const url = input.metadata.profileUrl ? profileKey(input.metadata.profileUrl) : "";
        const identity = url || (input.email ? `email:${input.email.toLowerCase()}` : JSON.stringify([input.name, input.text]));
        const employeeId = input.metadata.employeeId || `record-${createHash("sha256").update(identity).digest("hex").slice(0, 20)}`;
        const draft = profileToEmployeeDraft(profile, { employeeId, name: input.name, email: input.email, currentDepartment: input.metadata.department ?? "", ...(input.metadata.currentTitle ? { currentTitle: input.metadata.currentTitle } : {}), profileUrl: url,
          sourceText: cells.filter(cell => cell.text).map(cell => `${sheet.getCell(headerRow, cell.column).text}：${cell.text}`).join("\n\n"),
        });
        const validation = validateEmployeeResume(draft, now.slice(0, 10));
        if (validation.length) { for (const issue of validation) add({ ...issue, sheet: sheet.name, row }); continue; }
        const existingKey = ids.get(employeeId);
        if (existingKey && existingKey !== identity) throw new Error("员工编号被不同人员重复使用，请核对。");
        ids.set(employeeId, identity);
        const existing = drafts.get(identity);
        if (existing) { mergeEmployeeDraft(existing, draft); duplicates++; }
        else drafts.set(identity, draft);
        if (drafts.size > 10_000) throw new Error("去重后的员工数超过 10,000，请拆分文件。");
      } catch (error) { add({ sheet: sheet.name, row, field: "员工资料", code: "INVALID_ROW", message: error instanceof Error ? error.message : "无法读取该行员工资料。" }); }
    }
  }
  if (!tables) add({ sheet: "工作簿", row: 0, field: "表头", code: "HEADER_NOT_FOUND", message: "未找到员工表头，请在前 20 行提供姓名，以及工作经历、教育经历、简历全文或当前公司等列。支持中文表头和原三表模板。" });
  else if (!drafts.size && !totalIssueCount) add({ sheet: "工作簿", row: 0, field: "记录", code: "NO_EMPLOYEES", message: "没有可导入的员工记录。" });
  const records = [...drafts.values()];
  const warnings: string[] = [];
  if (duplicates) warnings.push(`跨工作表及重复行共合并 ${duplicates} 条重复员工记录。`);
  const incomplete = records.filter(item => item.warnings.length).length;
  if (incomplete) warnings.push(`${incomplete} 位员工存在缺失信息，已保留可识别的经历；邮箱、部门及未知日期未编造，详情可在员工资料中查看。`);
  return { data: totalIssueCount ? null : {
    employees: records.map(item => ({ ...item.employee, warnings: item.warnings })),
    workExperiences: records.flatMap(item => item.workExperiences.map(work => ({ ...work, employeeId: item.employee.employeeId }))),
    educationExperiences: records.flatMap(item => item.educations.map(education => ({ ...education, employeeId: item.employee.employeeId }))),
  }, issues, totalIssueCount, warnings };
}
