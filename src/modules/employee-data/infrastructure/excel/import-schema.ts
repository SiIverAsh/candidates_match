import { MAX_EMPLOYEE_IMPORT_BYTES } from "../../domain/policies";

export const EMPLOYEE_IMPORT_SCHEMA = {
  maxFileBytes: MAX_EMPLOYEE_IMPORT_BYTES,
  maxDisplayedIssues: 200,
  sheets: {
    Employees: {
      headers: [
        "employee_id",
        "name",
        "email",
        "current_department",
        "current_title",
      ],
      maxRows: 10_000,
    },
    WorkExperience: {
      headers: ["employee_id", "company", "title", "start_date", "end_date"],
      maxRows: 50_000,
    },
    Education: {
      headers: ["employee_id", "school", "major", "start_date", "end_date"],
      maxRows: 50_000,
    },
  },
} as const;

export type EmployeeImportSheetName = keyof typeof EMPLOYEE_IMPORT_SCHEMA.sheets;

export const EMPLOYEE_IMPORT_SHEET_NAMES = Object.keys(
  EMPLOYEE_IMPORT_SCHEMA.sheets,
) as EmployeeImportSheetName[];

