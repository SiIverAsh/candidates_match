import type { EmployeeDataVersionSummary } from "../domain/models";
import type { ImportValidationIssue } from "../application/ports";
import { z } from "zod";

const text = z.string().max(300);
const dates = { startDate: text, endDate: text.nullable(), current: z.boolean().optional() };
export const employeeResumeDraftSchema = z.object({
  employee: z.object({ employeeId: text, name: text, email: text, currentDepartment: text, currentTitle: text, profileUrl: z.string().max(2048).optional(), resumeFingerprint: z.string().max(64).nullable().optional(), sourceText: z.string().max(200_000).optional(), warnings: z.array(z.string().max(1000)).max(500).optional() }).strict(),
  workExperiences: z.array(z.object({ company: text, title: text, description: z.string().max(200_000).optional(), ...dates }).strict()).max(100),
  educations: z.array(z.object({ school: text, major: text, degree: text.optional(), ...dates }).strict()).max(100),
  warnings: z.array(z.string().max(1000)).max(500),
}).strict();

export const employeeResumesSchema = z.array(employeeResumeDraftSchema).min(1).max(20);
export const deleteEmployeesSchema = z.object({ versionId: z.string().min(1).max(100), employeeIds: z.array(z.string().min(1).max(300)).min(1).max(500).refine(ids => new Set(ids).size === ids.length) }).strict();

export interface ImportActionState {
  status: "idle" | "success" | "error";
  message: string;
  issues: ImportValidationIssue[];
  totalIssueCount: number;
  version: EmployeeDataVersionSummary | null;
  warnings?: string[];
}

export const INITIAL_IMPORT_STATE: ImportActionState = {
  status: "idle",
  message: "",
  issues: [],
  totalIssueCount: 0,
  version: null,
};

