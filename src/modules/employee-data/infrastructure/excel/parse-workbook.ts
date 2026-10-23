import ExcelJS, { type Cell, type Worksheet } from "exceljs";
import { readWorkbook } from "../../../../shared/infrastructure/excel/read-workbook";
import { parseFlatEmployeeWorkbook } from "./parse-flat-workbook";

import {
  EMPLOYEE_IMPORT_SCHEMA,
  EMPLOYEE_IMPORT_SHEET_NAMES,
  type EmployeeImportSheetName,
} from "./import-schema";
import type {
  EducationRecord,
  EmployeeRecord,
  WorkExperienceRecord,
} from "../../domain/models";
import type { ImportValidationIssue, ImportValidationResult } from "../../application/ports";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/u;

interface IssueCollector {
  issues: ImportValidationIssue[];
  total: number;
}

function addIssue(collector: IssueCollector, issue: ImportValidationIssue): void {
  collector.total += 1;
  if (collector.issues.length < EMPLOYEE_IMPORT_SCHEMA.maxDisplayedIssues) {
    collector.issues.push(issue);
  }
}

function hasFormula(cell: Cell): boolean {
  const value = cell.value;
  return Boolean(value && typeof value === "object" && "formula" in value);
}

function cellText(cell: Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim();
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "richText" in value) {
    return value.richText.map((part) => part.text).join("").trim();
  }
  if (typeof value === "object" && "text" in value) {
    return String(value.text).trim();
  }
  return "";
}

function isRowEmpty(sheet: Worksheet, row: number): boolean {
  for (let column = 1; column <= 5; column += 1) {
    if (cellText(sheet.getCell(row, column))) return false;
  }
  return true;
}

function requiredText(
  cell: Cell,
  collector: IssueCollector,
  sheet: string,
  row: number,
  field: string,
): string | null {
  if (hasFormula(cell)) {
    addIssue(collector, {
      sheet, row, field, code: "FORMULA_NOT_ALLOWED",
      message: "不接受公式，请粘贴为纯值。",
    });
    return null;
  }
  const value = cellText(cell);
  if (!value) {
    addIssue(collector, {
      sheet, row, field, code: "REQUIRED", message: "该字段为必填项。",
    });
    return null;
  }
  if (value.length > 300) {
    addIssue(collector, {
      sheet, row, field, code: "TOO_LONG",
      message: "字段长度不能超过 300 个字符。",
    });
    return null;
  }
  return value;
}

function normalizeDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string): string | null {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return null;
  const candidate = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
  const normalized = normalizeDate(candidate);
  return normalized === value ? normalized : null;
}

function dateValue(
  cell: Cell,
  collector: IssueCollector,
  sheet: string,
  row: number,
  field: string,
  required: boolean,
): string | null {
  if (hasFormula(cell)) {
    addIssue(collector, {
      sheet, row, field, code: "FORMULA_NOT_ALLOWED",
      message: "日期不接受公式，请粘贴为日期值。",
    });
    return null;
  }

  const raw = cell.value;
  if (raw === null || raw === undefined || cellText(cell) === "") {
    if (required) {
      addIssue(collector, {
        sheet, row, field, code: "REQUIRED", message: "该日期为必填项。",
      });
    }
    return null;
  }

  const parsed = raw instanceof Date ? normalizeDate(raw) : parseIsoDate(cellText(cell));
  const today = new Date().toISOString().slice(0, 10);
  if (!parsed) {
    addIssue(collector, {
      sheet, row, field, code: "INVALID_DATE",
      message: "日期必须是有效的 Excel 日期或 YYYY-MM-DD。",
    });
    return null;
  }
  if (parsed < "1900-01-01" || parsed > today) {
    addIssue(collector, {
      sheet, row, field, code: "DATE_OUT_OF_RANGE",
      message: "日期必须在 1900-01-01 至今天之间。",
    });
    return null;
  }
  return parsed;
}

function validateHeaders(
  sheet: Worksheet,
  name: EmployeeImportSheetName,
  collector: IssueCollector,
): boolean {
  const expected = EMPLOYEE_IMPORT_SCHEMA.sheets[name].headers;
  let valid = true;
  for (let index = 0; index < expected.length; index += 1) {
    const actual = cellText(sheet.getCell(1, index + 1));
    if (actual !== expected[index]) {
      valid = false;
      addIssue(collector, {
        sheet: name, row: 1, field: expected[index], code: "HEADER_MISMATCH",
        message: `第 ${index + 1} 列表头必须是 ${expected[index]}。`,
      });
    }
  }
  for (let index = expected.length + 1; index <= sheet.columnCount; index += 1) {
    const extra = cellText(sheet.getCell(1, index));
    if (extra) {
      valid = false;
      addIssue(collector, {
        sheet: name, row: 1, field: extra, code: "UNEXPECTED_HEADER",
        message: `存在未定义表头 ${extra}。`,
      });
    }
  }
  return valid;
}

function parseEmployees(
  sheet: Worksheet,
  collector: IssueCollector,
): { records: EmployeeRecord[]; sourceRows: Map<string, number> } {
  const records: EmployeeRecord[] = [];
  const sourceRows = new Map<string, number>();
  const maxRows = EMPLOYEE_IMPORT_SCHEMA.sheets.Employees.maxRows;
  if (sheet.rowCount - 1 > maxRows) {
    addIssue(collector, {
      sheet: "Employees", row: maxRows + 2, field: "记录数", code: "ROW_LIMIT_EXCEEDED",
      message: `员工记录不能超过 ${maxRows} 行。`,
    });
  }
  for (let row = 2; row <= Math.min(sheet.rowCount, maxRows + 1); row += 1) {
    if (isRowEmpty(sheet, row)) continue;
    const employeeId = requiredText(sheet.getCell(row, 1), collector, "Employees", row, "employee_id");
    const name = requiredText(sheet.getCell(row, 2), collector, "Employees", row, "name");
    const email = requiredText(sheet.getCell(row, 3), collector, "Employees", row, "email");
    const currentDepartment = requiredText(sheet.getCell(row, 4), collector, "Employees", row, "current_department");
    const currentTitle = requiredText(sheet.getCell(row, 5), collector, "Employees", row, "current_title");
    if (employeeId && sourceRows.has(employeeId)) {
      addIssue(collector, {
        sheet: "Employees", row, field: "employee_id", code: "DUPLICATE_EMPLOYEE_ID",
        message: `employee_id 与第 ${sourceRows.get(employeeId)} 行重复。`,
      });
    } else if (employeeId) {
      sourceRows.set(employeeId, row);
    }
    if (email && !EMAIL_PATTERN.test(email)) {
      addIssue(collector, {
        sheet: "Employees", row, field: "email", code: "INVALID_EMAIL",
        message: "工作邮箱格式无效。",
      });
    }
    if (employeeId && name && email && currentDepartment && currentTitle) {
      records.push({ employeeId, name, email, currentDepartment, currentTitle });
    }
  }
  return { records, sourceRows };
}

function parseWorkExperiences(
  sheet: Worksheet,
  employeeIds: Set<string>,
  collector: IssueCollector,
): WorkExperienceRecord[] {
  const records: WorkExperienceRecord[] = [];
  const maxRows = EMPLOYEE_IMPORT_SCHEMA.sheets.WorkExperience.maxRows;
  if (sheet.rowCount - 1 > maxRows) {
    addIssue(collector, {
      sheet: "WorkExperience", row: maxRows + 2, field: "记录数", code: "ROW_LIMIT_EXCEEDED",
      message: `工作经历不能超过 ${maxRows} 行。`,
    });
  }
  for (let row = 2; row <= Math.min(sheet.rowCount, maxRows + 1); row += 1) {
    if (isRowEmpty(sheet, row)) continue;
    const employeeId = requiredText(sheet.getCell(row, 1), collector, "WorkExperience", row, "employee_id");
    const company = requiredText(sheet.getCell(row, 2), collector, "WorkExperience", row, "company");
    const title = requiredText(sheet.getCell(row, 3), collector, "WorkExperience", row, "title");
    const startDate = dateValue(sheet.getCell(row, 4), collector, "WorkExperience", row, "start_date", true);
    const endDate = dateValue(sheet.getCell(row, 5), collector, "WorkExperience", row, "end_date", false);
    if (employeeId && !employeeIds.has(employeeId)) {
      addIssue(collector, {
        sheet: "WorkExperience", row, field: "employee_id", code: "UNKNOWN_EMPLOYEE_ID",
        message: "employee_id 在 Employees 中不存在。",
      });
    }
    if (startDate && endDate && startDate > endDate) {
      addIssue(collector, {
        sheet: "WorkExperience", row, field: "end_date", code: "INVALID_DATE_RANGE",
        message: "结束日期不能早于开始日期。",
      });
    }
    if (employeeId && company && title && startDate) {
      records.push({ employeeId, company, title, startDate, endDate });
    }
  }
  return records;
}

function parseEducation(
  sheet: Worksheet,
  employeeIds: Set<string>,
  collector: IssueCollector,
): EducationRecord[] {
  const records: EducationRecord[] = [];
  const maxRows = EMPLOYEE_IMPORT_SCHEMA.sheets.Education.maxRows;
  if (sheet.rowCount - 1 > maxRows) {
    addIssue(collector, {
      sheet: "Education", row: maxRows + 2, field: "记录数", code: "ROW_LIMIT_EXCEEDED",
      message: `教育经历不能超过 ${maxRows} 行。`,
    });
  }
  for (let row = 2; row <= Math.min(sheet.rowCount, maxRows + 1); row += 1) {
    if (isRowEmpty(sheet, row)) continue;
    const employeeId = requiredText(sheet.getCell(row, 1), collector, "Education", row, "employee_id");
    const school = requiredText(sheet.getCell(row, 2), collector, "Education", row, "school");
    const major = requiredText(sheet.getCell(row, 3), collector, "Education", row, "major");
    const startDate = dateValue(sheet.getCell(row, 4), collector, "Education", row, "start_date", true);
    const endDate = dateValue(sheet.getCell(row, 5), collector, "Education", row, "end_date", false);
    if (employeeId && !employeeIds.has(employeeId)) {
      addIssue(collector, {
        sheet: "Education", row, field: "employee_id", code: "UNKNOWN_EMPLOYEE_ID",
        message: "employee_id 在 Employees 中不存在。",
      });
    }
    if (startDate && endDate && startDate > endDate) {
      addIssue(collector, {
        sheet: "Education", row, field: "end_date", code: "INVALID_DATE_RANGE",
        message: "结束日期不能早于开始日期。",
      });
    }
    if (employeeId && school && major && startDate) {
      records.push({ employeeId, school, major, startDate, endDate });
    }
  }
  return records;
}

export async function parseEmployeeWorkbook(bytes: ArrayBuffer): Promise<ImportValidationResult> {
  const collector: IssueCollector = { issues: [], total: 0 };
  let workbook: ExcelJS.Workbook;
  try {
    workbook = await readWorkbook(bytes);
  } catch (error) {
    if (process.env.DEBUG_EMPLOYEE_IMPORT === "1") {
      console.error("Employee workbook parsing failed.", { code: "CORRUPTED_XLSX" });
    }
    addIssue(collector, {
      sheet: "文件", row: 0, field: "file", code: "CORRUPTED_XLSX",
      message: error instanceof Error ? error.message : "工作簿无法解析，请用 Excel／WPS 重新另存为 .xlsx。",
    });
    return { data: null, issues: collector.issues, totalIssueCount: collector.total };
  }

  if (!EMPLOYEE_IMPORT_SHEET_NAMES.some(name => workbook.getWorksheet(name)?.getCell(1, 1).text === "employee_id")) return parseFlatEmployeeWorkbook(workbook);

  for (const worksheet of workbook.worksheets) {
    if (!EMPLOYEE_IMPORT_SHEET_NAMES.includes(worksheet.name as EmployeeImportSheetName)) {
      addIssue(collector, {
        sheet: worksheet.name, row: 1, field: "工作表", code: "UNEXPECTED_SHEET",
        message: "工作簿包含未定义的工作表。",
      });
    }
  }

  const sheets = new Map<EmployeeImportSheetName, Worksheet>();
  for (const name of EMPLOYEE_IMPORT_SHEET_NAMES) {
    const sheet = workbook.getWorksheet(name);
    if (!sheet) {
      addIssue(collector, {
        sheet: name, row: 1, field: "工作表", code: "MISSING_SHEET",
        message: `缺少工作表 ${name}。`,
      });
    } else if (validateHeaders(sheet, name, collector)) {
      sheets.set(name, sheet);
    }
  }
  if (sheets.size !== EMPLOYEE_IMPORT_SHEET_NAMES.length) {
    return { data: null, issues: collector.issues, totalIssueCount: collector.total };
  }

  const employeeResult = parseEmployees(sheets.get("Employees")!, collector);
  const employeeIds = new Set(employeeResult.records.map((employee) => employee.employeeId));
  const workExperiences = parseWorkExperiences(sheets.get("WorkExperience")!, employeeIds, collector);
  const educationExperiences = parseEducation(sheets.get("Education")!, employeeIds, collector);
  if (employeeResult.records.length === 0) {
    addIssue(collector, {
      sheet: "Employees", row: 2, field: "记录", code: "NO_EMPLOYEES",
      message: "至少需要一条有效员工记录。",
    });
  }
  const workIds = new Set(workExperiences.map((record) => record.employeeId));
  const educationIds = new Set(educationExperiences.map((record) => record.employeeId));
  for (const employee of employeeResult.records) {
    const row = employeeResult.sourceRows.get(employee.employeeId) ?? 2;
    if (!workIds.has(employee.employeeId)) {
      addIssue(collector, {
        sheet: "Employees", row, field: "employee_id", code: "MISSING_WORK_EXPERIENCE",
        message: "该员工至少需要一条工作经历。",
      });
    }
    if (!educationIds.has(employee.employeeId)) {
      addIssue(collector, {
        sheet: "Employees", row, field: "employee_id", code: "MISSING_EDUCATION",
        message: "该员工至少需要一条教育经历。",
      });
    }
  }

  return {
    data: collector.total === 0
      ? { employees: employeeResult.records, workExperiences, educationExperiences }
      : null,
    issues: collector.issues,
    totalIssueCount: collector.total,
  };
}



