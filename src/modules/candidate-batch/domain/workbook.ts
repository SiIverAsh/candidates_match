import { validateCandidateText } from "../../candidate-intake/domain/policies";
import { normalizePersonProfileUrl } from "../../../shared/domain/person-identity";

export const CANDIDATE_WORKBOOK_LIMITS = { maxBytes: 10 * 1024 * 1024, maxExpandedBytes: 50 * 1024 * 1024 } as const;
export const CANDIDATE_COLUMNS = {
  name: ["姓名", "候选人姓名", "候选人", "人员姓名", "名字", "name", "candidate name", "full name"],
  email: ["邮箱", "电子邮箱", "电子邮件", "联系邮箱", "email", "e-mail"],
  profileUrl: ["LinkedIn Public URL", "LinkedIn URL", "LinkedIn", "profile_url", "profile url", "领英链接", "领英主页", "个人主页"],
  employeeId: ["employee_id", "employee id", "员工编号", "工号"],
  phone: ["电话", "手机", "手机号", "手机号码", "联系电话", "联系方式", "phone", "mobile"],
  work: ["工作经历", "完整工作经历", "工作经验", "任职经历", "职业经历", "实习经历", "work_experience", "employment history"],
  education: ["教育经历", "完整教育经历", "教育背景", "学习经历", "教育信息", "education", "education history"],
  resume: ["简历全文", "简历文本", "简历内容", "简历正文", "个人简历", "简历", "resume_text", "resume", "cv"],
  company: ["公司", "公司名称", "工作单位", "任职公司", "所在公司", "现任公司", "当前公司", "最近公司", "company", "employer"],
  title: ["职位", "岗位", "职务", "职位名称", "岗位名称", "当前职位", "title", "job title", "position"],
  workStart: ["入职时间", "入职日期", "工作开始时间", "开始工作时间", "任职开始时间", "work start", "employment start"],
  workEnd: ["离职时间", "离职日期", "工作结束时间", "任职结束时间", "work end", "employment end"],
  workPeriod: ["任职时间", "工作时间", "工作起止时间", "任职起止时间", "employment period", "work period"],
  school: ["学校", "院校", "毕业院校", "毕业学校", "就读院校", "大学", "school", "university", "college"],
  major: ["专业", "所学专业", "专业名称", "主修专业", "major", "field of study"],
  educationStart: ["入学时间", "入学日期", "教育开始时间", "就读开始时间", "education start"],
  educationEnd: ["毕业时间", "毕业日期", "教育结束时间", "就读结束时间", "education end", "graduation date"],
  educationPeriod: ["就读时间", "学习时间", "教育时间", "教育起止时间", "就读起止时间", "education period"],
  degree: ["学历", "学位", "最高学历", "degree", "qualification"],
} as const;
export type CandidateColumn = keyof typeof CANDIDATE_COLUMNS;
export interface WorkbookCandidateRow { rowNumber: number; name: string; text: string; error: string | null; sheetName?: string }
export interface WorkbookColumn { column: number; field: CandidateColumn; group: number; label: string }
export interface WorkbookHeader { rowNumber: number; columns: WorkbookColumn[]; ignored: string[] }

function headerKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/必填|选填|可选/gu, "").replace(/[\s_\-()（）[\]【】:：/\\*]+/gu, "");
}

export function identifyWorkbookColumn(label: string): Pick<WorkbookColumn, "field" | "group"> | null {
  let key = headerKey(label);
  const digit = key.match(/\d+/u)?.[0];
  const group = digit ? Number(digit) : 1;
  key = key.replace(/\d+/gu, "");
  const entries = Object.entries(CANDIDATE_COLUMNS) as [CandidateColumn, readonly string[]][];
  const exact = entries.find(([, aliases]) => aliases.some(alias => headerKey(alias) === key));
  if (exact) return { field: exact[0], group };
  const category = /^(?:工作经历|工作经验|任职经历|实习经历)/u.test(key) ? "work" : /^(?:教育经历|教育背景|学习经历)/u.test(key) ? "education" : null;
  if (!category) return null;
  key = key.replace(/^(?:工作经历|工作经验|任职经历|实习经历|教育经历|教育背景|学习经历)/u, "");
  if (["开始时间", "开始日期", "起始时间"].includes(key)) return { field: category === "work" ? "workStart" : "educationStart", group };
  if (["结束时间", "结束日期"].includes(key)) return { field: category === "work" ? "workEnd" : "educationEnd", group };
  if (["时间", "起止时间"].includes(key)) return { field: category === "work" ? "workPeriod" : "educationPeriod", group };
  const nested = entries.find(([, aliases]) => aliases.some(alias => headerKey(alias) === key));
  return nested ? { field: nested[0], group } : null;
}

export function detectWorkbookHeader(rows: { rowNumber: number; cells: { column: number; text: string }[] }[]): WorkbookHeader | null {
  for (const row of rows) {
    const columns: WorkbookColumn[] = [];
    const ignored: string[] = [];
    for (const cell of row.cells) {
      const match = identifyWorkbookColumn(cell.text);
      if (match) columns.push({ ...match, column: cell.column, label: cell.text });
      else if (cell.text) ignored.push(cell.text.slice(0, 60));
    }
    if (columns.some(column => column.field === "name") && columns.some(column => !["name", "email", "phone", "profileUrl", "employeeId"].includes(column.field))) return { rowNumber: row.rowNumber, columns, ignored };
  }
  return null;
}

function dateRange(period?: string, start?: string, end?: string): string {
  return period || (start && end ? `${start}—${end}` : start ? `${start}—结束时间未提供` : "");
}

export function assembleWorkbookValues(cells: { field: CandidateColumn; group: number; text: string }[]): Partial<Record<CandidateColumn, string>> {
  const basic: Partial<Record<CandidateColumn, string>> = {};
  const groups = new Map<number, Partial<Record<CandidateColumn, string>>>();
  for (const cell of cells) {
    if (["name", "email", "phone", "resume", "profileUrl", "employeeId"].includes(cell.field)) basic[cell.field] = cell.text;
    else {
      const group = groups.get(cell.group) ?? {};
      group[cell.field] = cell.text;
      groups.set(cell.group, group);
    }
  }
  const works: string[] = [];
  const educations: string[] = [];
  for (const [, group] of [...groups].sort(([a], [b]) => a - b)) {
    const workDates = dateRange(group.workPeriod, group.workStart, group.workEnd);
    const educationDates = dateRange(group.educationPeriod, group.educationStart, group.educationEnd);
    const work = group.work || [group.company && `公司：${group.company}`, group.title && `职位：${group.title}`, workDates && `任职时间：${workDates}`, !workDates && group.workEnd && `结束日期（未提供开始日期）：${group.workEnd}`].filter(Boolean).join("\n");
    const education = group.education || [group.school && `学校：${group.school}`, group.major && `专业：${group.major}`, educationDates && `就读时间：${educationDates}`, !educationDates && group.educationEnd && `毕业日期（未提供入学日期）：${group.educationEnd}`, group.degree && `学位：${group.degree}`].filter(Boolean).join("\n");
    if (work) works.push(work);
    if (education) educations.push(education);
  }
  return { ...basic, work: works.join("\n工作经历\n"), education: educations.join("\n教育经历\n") };
}

export function prepareWorkbookRow(rowNumber: number, values: Partial<Record<CandidateColumn, string>>, cellError: string | null): WorkbookCandidateRow {
  const { name = "", email = "", phone = "", profileUrl = "", employeeId = "", work = "", education = "", resume = "" } = values;
  const row = { rowNumber, name: name.slice(0, 100), text: "", error: cellError };
  if (row.error) return row;
  if (!name || name.length > 100 || /[\r\n]/u.test(name)) return { ...row, error: "姓名必填，最多 100 字且不能换行。" };
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254)) return { ...row, error: "邮箱格式无效，请修正或留空。" };
  if (phone.length > 50 || /[\r\n]/u.test(phone)) return { ...row, error: "电话最多 50 字且不能换行，请设置为文本格式。" };
  if (profileUrl && (profileUrl.length > 2048 || /[\r\n]/u.test(profileUrl) || !normalizePersonProfileUrl(profileUrl))) return { ...row, error: "个人主页链接无效，请填写个人主页或留空。" };
  if (employeeId.length > 300 || /[\r\n]/u.test(employeeId)) return { ...row, error: "员工编号最多 300 字且不能换行。" };
  if (!resume && !work && !education) return { ...row, error: "请填写简历全文，或至少一段工作／教育经历。" };
  // Full resume takes precedence; do not duplicate the same experiences from multiple columns.
  const experience = resume || [work && `工作经历\n${work}`, education && `教育经历\n${education}`].filter(Boolean).join("\n\n");
  // The explicit name column is authoritative, even if the pasted resume has another name label.
  const text = [experience, `姓名：${name}`, email && `邮箱：${email}`, phone && `电话：${phone}`, profileUrl && `个人主页：${profileUrl}`, employeeId && `员工编号：${employeeId}`].filter(Boolean).join("\n");
  const validated = validateCandidateText(text, "WORKBOOK_ROW");
  return validated.ok ? { ...row, text: validated.text } : { ...row, error: validated.message };
}
