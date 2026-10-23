import { assembleWorkbookValues, identifyWorkbookColumn, type CandidateColumn } from "../../candidate-batch/domain/workbook";
import { normalizeEmployeeExperienceText } from "./experience-text";

export type EmployeeColumn = CandidateColumn | "employeeId" | "department" | "currentTitle" | "currentCompany" | "profileUrl";
export interface EmployeeColumnMapping { column: number; field: EmployeeColumn; group: number }

const COLUMNS: Record<string, EmployeeColumn> = {
  employeeid: "employeeId", 员工编号: "employeeId", 员工号: "employeeId", 工号: "employeeId", 员工id: "employeeId",
  姓名: "name", 员工姓名: "name", 人员姓名: "name",
  currentdepartment: "department", department: "department", 当前部门: "department", 部门: "department", 所属部门: "department",
  currenttitle: "currentTitle", 当前职位: "currentTitle", 现任职位: "currentTitle",
  currentcompany: "currentCompany", 当前公司: "currentCompany", 现任公司: "currentCompany",
  linkedinpublicurl: "profileUrl", linkedinurl: "profileUrl", profileurl: "profileUrl", 领英链接: "profileUrl", 个人主页: "profileUrl",
  邮箱: "email", 工作邮箱: "email", 员工邮箱: "email",
};

export function identifyEmployeeColumn(label: string): { field: EmployeeColumn; group: number } | null {
  const key = label.normalize("NFKC").toLowerCase().replace(/[\s_\-()（）:：*]+/gu, "");
  return COLUMNS[key] ? { field: COLUMNS[key], group: 1 } : identifyWorkbookColumn(label);
}

export function employeeWorkbookText(cells: { field: EmployeeColumn; group: number; text: string }[]) {
  const metadata: Partial<Record<EmployeeColumn, string>> = {};
  const candidateCells: { field: CandidateColumn; group: number; text: string }[] = [];
  for (const cell of cells) {
    if (["employeeId", "department", "currentTitle", "currentCompany", "profileUrl"].includes(cell.field)) metadata[cell.field] = cell.text;
    else candidateCells.push({ ...cell, field: cell.field as CandidateColumn, text: cell.field === "work" ? normalizeEmployeeExperienceText(cell.text, "work") : cell.field === "education" ? normalizeEmployeeExperienceText(cell.text, "education") : cell.text });
  }
  const values = assembleWorkbookValues(candidateCells);
  const text = values.resume || [
    values.name && `姓名：${values.name}`,
    (values.work || metadata.currentCompany) && `工作经历\n${values.work || `公司：${metadata.currentCompany}\n职位：${metadata.currentTitle ?? ""}`}`,
    values.education && `教育经历\n${values.education}`,
  ].filter(Boolean).join("\n\n");
  return { text, metadata, name: values.name ?? "", email: values.email ?? "" };
}
