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
    },
    WorkExperience: {
      headers: ["employee_id", "company", "title", "start_date", "end_date"],
    },
    Education: {
      headers: ["employee_id", "school", "major", "start_date", "end_date"],
    },
  },
} as const;

export type EmployeeImportSheetName = keyof typeof EMPLOYEE_IMPORT_SCHEMA.sheets;

export const EMPLOYEE_IMPORT_SHEET_NAMES = Object.keys(
  EMPLOYEE_IMPORT_SCHEMA.sheets,
) as EmployeeImportSheetName[];

