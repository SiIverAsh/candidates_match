import ExcelJS, { type Cell, type Workbook, type Worksheet } from "exceljs";
import { validateEmployeeResume, type EmployeeResumeDraft } from "../../domain/resume-import";
import type { ImportValidationIssue, ImportValidationResult } from "../../application/ports";

type RowValues = Record<string, string>;
type LocatedRow = { sheet: string; row: number; values: RowValues };
type Pending = { draft: EmployeeResumeDraft; person: LocatedRow; work: LocatedRow[]; education: LocatedRow[]; research: LocatedRow[]; attachments: LocatedRow[] };
const TABLES: Record<string, string[]> = {
  人员: ["记录ID", "复核状态", "文件状态", "姓名", "解析提示", "原文件", "源文件SHA256"],
  工作经历: ["记录ID", "经历序号", "员工草稿包含", "公司原文", "职位", "开始日期", "开始精度", "结束日期", "结束精度", "任职状态", "工作描述"],
  教育经历: ["记录ID", "经历序号", "员工草稿包含", "学校原文", "专业原文", "学位", "开始日期", "开始精度", "结束日期", "结束精度", "就读状态"],
  研究经历: ["记录ID", "章节序号", "章节标题", "研究正文"],
  需处理: ["记录ID"],
  原文段落: ["记录ID", "段落名称", "片段序号", "段落原文"],
};
const REQUIRED = ["人员", "工作经历", "教育经历"];
const ALLOWED = new Set(["使用说明", ...Object.keys(TABLES)]);

function formula(cell: Cell): boolean {
  const value = cell.value;
  return cell.type === ExcelJS.ValueType.Formula || Boolean(value && typeof value === "object" && ("formula" in value || "sharedFormula" in value));
}
function text(cell: Cell): string {
  const value = cell.value;
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "richText" in value) return value.richText.map(part => part.text).join("");
  if (typeof value === "object" && "hyperlink" in value) return String(value.text);
  return "";
}
function firstRowLabels(sheet: Worksheet | undefined): Set<string> {
  const labels = new Set<string>();
  sheet?.getRow(1).eachCell(cell => labels.add(text(cell).trim()));
  return labels;
}
export function isStandardizedEmployeeWorkbook(workbook: Workbook): boolean {
  const people = firstRowLabels(workbook.getWorksheet("人员"));
  const work = firstRowLabels(workbook.getWorksheet("工作经历"));
  const education = firstRowLabels(workbook.getWorksheet("教育经历"));
  return (people.has("记录ID") && (people.has("复核状态") || people.has("原文件") || people.has("解析状态"))) ||
    (work.has("记录ID") && work.has("公司原文")) || (education.has("记录ID") && education.has("学校原文"));
}

export function parseStandardizedEmployeeWorkbook(workbook: Workbook): ImportValidationResult {
  const issues: ImportValidationIssue[] = [];
  let totalIssueCount = 0;
  const add = (sheet: string, row: number, field: string, code: string, message: string) => {
    totalIssueCount++;
    if (issues.length < 200) issues.push({ sheet, row, field, code, message });
  };
  const dataRows = new Map<string, LocatedRow[]>();
  for (const sheet of workbook.worksheets) {
    if (!ALLOWED.has(sheet.name)) add(sheet.name, 1, "工作表", "UNEXPECTED_SHEET", "标准化工作簿含未支持的工作表，请核对后移除或另存。");
    sheet.eachRow((row, rowNumber) => row.eachCell((cell, column) => {
      const field = text(sheet.getCell(1, column)).trim() || `第${column}列`;
      if (formula(cell)) add(sheet.name, rowNumber, field, "FORMULA_NOT_ALLOWED", "不接受公式，请粘贴为纯值。");
      else if (cell.type === ExcelJS.ValueType.Error) add(sheet.name, rowNumber, field, "CELL_ERROR", "单元格含错误值，请改为纯值。");
      else if (cell.isMerged) add(sheet.name, rowNumber, field, "MERGED_CELL", "请取消合并单元格后重新导入。");
    }));
    const required = TABLES[sheet.name];
    if (!required) continue;
    const headers = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, column) => {
      const header = text(cell).trim();
      if (!header) return;
      if (headers.has(header)) add(sheet.name, 1, header, "DUPLICATE_HEADER", "表头重复，请保留唯一列名。");
      else headers.set(header, column);
    });
    for (const field of required) if (!headers.has(field)) add(sheet.name, 1, field, "MISSING_HEADER", `缺少必需表头 ${field}。`);
    const rows: LocatedRow[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values: RowValues = {};
      for (const [header, column] of headers) values[header] = text(row.getCell(column));
      row.eachCell((cell, column) => {
        if (text(cell).trim() && ![...headers.values()].includes(column)) add(sheet.name, rowNumber, `第${column}列`, "MISSING_HEADER", "数据列缺少表头，请补充后重试。");
      });
      if (Object.values(values).some(value => value.trim())) rows.push({ sheet: sheet.name, row: rowNumber, values });
    });
    dataRows.set(sheet.name, rows);
  }
  for (const sheet of REQUIRED) if (!workbook.getWorksheet(sheet)) add(sheet, 1, "工作表", "MISSING_SHEET", `缺少工作表 ${sheet}。`);
  // Exports based on v17+ carry research sections. A missing sheet and count
  // column cannot be interpreted as an empty legacy v16 export.
  const personRows = dataRows.get("人员") ?? [];
  const researchVersion = personRows.some(row => {
    const version = row.values["解析器版本"]?.trim().match(/^resume-heuristic-v(\d+)$/u);
    return version ? Number(version[1]) >= 17 : false;
  });
  if (researchVersion) {
    if (!firstRowLabels(workbook.getWorksheet("人员")).has("研究章节数")) add("人员", 1, "研究章节数", "MISSING_HEADER", "该解析器版本支持研究经历，缺少研究章节数，无法确认数据完整性。");
    if (!workbook.getWorksheet("研究经历")) add("研究经历", 1, "工作表", "MISSING_SHEET", "该解析器版本支持研究经历，缺少研究经历表。");
  }
  const summary = { totalEmployees: dataRows.get("人员")?.length ?? 0, workExperienceCount: dataRows.get("工作经历")?.length ?? 0, educationCount: dataRows.get("教育经历")?.length ?? 0, researchCount: dataRows.get("研究经历")?.length ?? 0 };
  if (totalIssueCount) return { data: null, issues, totalIssueCount, format: "standardized", summary };

  const people = new Map<string, Pending>();
  for (const row of dataRows.get("人员") ?? []) {
    const v = row.values, id = v["记录ID"].trim();
    if (!id) { add(row.sheet, row.row, "记录ID", "REQUIRED", "记录ID不能为空。"); continue; }
    if (people.has(id)) { add(row.sheet, row.row, "记录ID", "DUPLICATE_EMPLOYEE_ID", "记录ID重复，请逐条核对。"); continue; }
    const employee = { employeeId: id, name: v["姓名"].trim(), email: (v["邮箱"] ?? "").trim(), currentDepartment: (v["当前部门"] ?? "").trim(), currentTitle: (v["当前职位候选"] ?? "").trim(), profileUrl: (v["个人主页"] ?? "").trim() };
    const warnings = [v["解析提示"], v["复核状态"] ? `复核状态：${v["复核状态"]}` : ""].filter(Boolean);
    people.set(id, { draft: { employee, workExperiences: [], educations: [], researchExperiences: [], warnings }, person: row, work: [], education: [], research: [], attachments: [] });
    if (!["valid", "invalid"].includes(v["文件状态"].trim())) add(row.sheet, row.row, "文件状态", "SOURCE_NOT_READ", "源文件尚未完整读取，请先核对并补充。");
  }
  if (!people.size) add("人员", 2, "记录ID", "NO_EMPLOYEES", "至少需要一条员工记录。");
  const sequences = new Set<string>();
  for (const sheet of ["工作经历", "教育经历", "研究经历", "需处理", "原文段落"]) {
    for (const row of dataRows.get(sheet) ?? []) {
      const id = row.values["记录ID"]?.trim() ?? "", pending = people.get(id);
      if (!pending) { add(sheet, row.row, "记录ID", id ? "UNKNOWN_EMPLOYEE_ID" : "REQUIRED", "记录ID为空或不在人员表中。"); continue; }
      if (sheet === "需处理" || sheet === "原文段落") { pending.attachments.push(row); continue; }
      const seqField = sheet === "研究经历" ? "章节序号" : "经历序号";
      const seq = row.values[seqField].trim();
      if (!/^\d+$/u.test(seq) || !Number.isSafeInteger(Number(seq))) add(sheet, row.row, seqField, "INVALID_SEQUENCE", "序号必须是可安全表示的非负整数。");
      else {
        const key = JSON.stringify([sheet, id, Number(seq)]);
        if (sequences.has(key)) add(sheet, row.row, seqField, "DUPLICATE_SEQUENCE", "同一记录的经历序号重复。");
        sequences.add(key);
      }
      if (sheet === "工作经历") pending.work.push(row);
      else if (sheet === "教育经历") pending.education.push(row);
      else pending.research.push(row);
    }
  }

  // Restore any text split by the exporter, without interpreting escape text.
  const restore = (pending: Pending, row: LocatedRow, field: string): string => {
    const value = row.values[field] ?? "";
    if (!value.startsWith("完整值见原文段落：")) return value;
    const seq = row.values["经历序号"] ?? row.values["章节序号"] ?? "";
    const parts = pending.attachments.filter(x => x.sheet === "原文段落" && x.values["段落名称"] === "超长字段" && x.values["对应表"] === row.sheet && x.values["对应字段"] === field && (x.values["来源序号"] ?? "") === seq)
      .sort((a, b) => Number(a.values["片段序号"]) - Number(b.values["片段序号"]));
    if (!parts.length || parts.some((part, index) => part.values["片段序号"] !== String(index + 1))) {
      add(row.sheet, row.row, field, "MISSING_TEXT_CHUNK", "超长字段片段缺失或序号不连续，请核对原文段落表。"); return "";
    }
    return parts.map(part => part.values["段落原文"] ?? "").join("");
  };
  const precisionDate = (row: LocatedRow, label: "开始" | "结束"): string => {
    const value = (row.values[`${label}日期`] ?? "").trim(), precision = (row.values[`${label}精度`] ?? "").trim();
    const patterns: Record<string, RegExp> = { YEAR: /^\d{4}$/u, MONTH: /^\d{4}-\d{2}$/u, DAY: /^\d{4}-\d{2}-\d{2}$/u, UNKNOWN: /^$/u };
    if (!patterns[precision] || !patterns[precision].test(value)) add(row.sheet, row.row, `${label}精度`, "INVALID_DATE_PRECISION", "日期与精度不匹配；未知日期须使用 UNKNOWN 并留空日期。");
    return value;
  };
  const isCurrent = (row: LocatedRow, endDate: string): boolean => {
    const field = row.sheet === "工作经历" ? "任职状态" : "就读状态", value = (row.values[field] ?? "").trim();
    if (value === "来源标注至今" && !endDate) return true;
    if ((value === "有结束日期" && endDate) || (value === "未标注/未知" && !endDate)) return false;
    add(row.sheet, row.row, field, "INVALID_DATE_STATUS", "状态与结束日期不一致或不明确，请核对。"); return false;
  };
  for (const pending of people.values()) {
    const { draft } = pending;
    for (const [field, sheet, actual] of [["工作中间记录数", "工作经历", pending.work.length], ["教育中间记录数", "教育经历", pending.education.length], ["研究章节数", "研究经历", pending.research.length]] as const) {
      if (!(field in pending.person.values)) continue;
      const expected = pending.person.values[field].trim();
      if (!/^\d+$/u.test(expected) || Number(expected) !== actual) add("人员", pending.person.row, field, "EXPERIENCE_COUNT_MISMATCH", `${sheet}关联记录数与人员表不一致，请核对缺失或多余的行。`);
    }
    for (const row of pending.work) {
      const v = row.values, startDate = precisionDate(row, "开始"), endDate = precisionDate(row, "结束");
      if (!["是", "否"].includes(v["员工草稿包含"].trim())) add(row.sheet, row.row, "员工草稿包含", "INVALID_VALUE", "请填写是或否。");
      if (v["员工草稿包含"].trim() === "否") add(row.sheet, row.row, "员工草稿包含", "EXPERIENCE_REQUIRES_REVIEW", "该经历未包含于原员工草稿，请核对并确认是否导入。");
      draft.workExperiences.push({ company: restore(pending, row, "公司原文").trim(), title: restore(pending, row, "职位").trim(), startDate, endDate: endDate || null, current: isCurrent(row, endDate), description: restore(pending, row, "工作描述") });
    }
    for (const row of pending.education) {
      const v = row.values, startDate = precisionDate(row, "开始"), endDate = precisionDate(row, "结束");
      if (!["是", "否"].includes(v["员工草稿包含"].trim())) add(row.sheet, row.row, "员工草稿包含", "INVALID_VALUE", "请填写是或否。");
      if (v["员工草稿包含"].trim() === "否") add(row.sheet, row.row, "员工草稿包含", "EXPERIENCE_REQUIRES_REVIEW", "该经历未包含于原员工草稿，请核对并确认是否导入。");
      draft.educations.push({ school: restore(pending, row, "学校原文").trim(), major: restore(pending, row, "专业原文").trim(), degree: restore(pending, row, "学位"), startDate, endDate: endDate || null, current: isCurrent(row, endDate) });
    }
    for (const row of pending.research) {
      const heading = restore(pending, row, "章节标题"), description = restore(pending, row, "研究正文");
      if (!heading.trim()) add(row.sheet, row.row, "章节标题", "REQUIRED", "研究章节标题不能为空。");
      if (!description.trim()) add(row.sheet, row.row, "研究正文", "REQUIRED", "研究正文不能为空。");
      draft.researchExperiences!.push({ heading, description });
    }
    for (const issue of validateEmployeeResume(draft, new Date().toISOString().slice(0, 10))) {
      const location = issue.sheet === "WorkExperience" ? pending.work[issue.row - 1] : issue.sheet === "Education" ? pending.education[issue.row - 1] : pending.person;
      const names: Record<string, string> = { name: "姓名", email: "邮箱", company: "公司原文", title: "职位", school: "学校原文", major: "专业原文", startDate: "开始日期", endDate: "结束日期", employeeId: "记录ID", 记录: "记录ID" };
      add(location.sheet, location.row, names[issue.field] ?? issue.field, issue.code, issue.message);
    }
    const meta = [pending.person, ...pending.work, ...pending.education, ...pending.research, ...pending.attachments];
    draft.employee.sourceText = JSON.stringify({ format: "standardized-workbook", rows: meta });
  }
  const groups = [...people.values()];
  const values = groups.map(x => x.draft);
  for (const [field, column, key] of [["email", "邮箱", (p: Pending) => p.draft.employee.email.toLowerCase()], ["profileUrl", "个人主页", (p: Pending) => p.draft.employee.profileUrl ?? ""]] as const) {
    const identities = new Map<string, Pending[]>();
    for (const pending of groups) {
      const value = key(pending);
      if (value) identities.set(value, [...(identities.get(value) ?? []), pending]);
    }
    for (const group of identities.values()) if (group.length > 1) for (const pending of group) {
      pending.draft.warnings.push(`${column}与其他记录重复，记录未自动合并。`);
      add("人员", pending.person.row, column, field === "email" ? "DUPLICATE_EMAIL" : "DUPLICATE_PROFILE_URL", `${column}与其他记录重复，请逐条核对。`);
    }
  }
  return { data: totalIssueCount ? null : {
    employees: values.map(x => ({ ...x.employee, warnings: x.warnings })),
    workExperiences: values.flatMap(x => x.workExperiences.map(w => ({ ...w, employeeId: x.employee.employeeId }))),
    educationExperiences: values.flatMap(x => x.educations.map(e => ({ ...e, employeeId: x.employee.employeeId }))),
    researchExperiences: values.flatMap(x => (x.researchExperiences ?? []).map(r => ({ ...r, employeeId: x.employee.employeeId }))),
  }, issues, totalIssueCount, format: "standardized", summary, warnings: ["标准化数据来自自动提取，请逐项对照原件复核。"] };
}
