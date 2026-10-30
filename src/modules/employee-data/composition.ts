import { deleteEmployees as deleteEmployeeRecords } from "./application/delete-employees";
import { getEmployeeDataOverview } from "./application/get-employee-data-overview";
import { getEmployeeProfile, listEmployees } from "./application/browse-employees";
import { importEmployeeResume, importEmployeeResumes, previewEmployeeResume } from "./application/import-employee-resume";
import { employeeResumeReader } from "./infrastructure/resume/read-resume";
import type { EmployeeResumeDraft } from "./domain/resume-import";
import type { ImportActor, EmployeeResumeReader } from "./application/ports";
import {
  importEmployeeWorkbook,
  previewEmployeeWorkbook,
  type ImportEmployeeWorkbookCommand,
} from "./application/import-employee-workbook";
import { parseEmployeeWorkbook } from "./infrastructure/excel/parse-workbook";
import {
  getEmployeeDataOverview as readOverview,
  publishEmployeeData,
  appendEmployeeData,
  recordFailedImport,
  listCurrentEmployees,
  findEmployeeProfile,
  deleteEmployees,
} from "./infrastructure/sqlite/repository";

const repository = {
  getOverview: readOverview,
  publishEmployeeData,
  recordFailedImport,
};

export const employeeDataApplication = {
  previewResume: (file: Parameters<EmployeeResumeReader["read"]>[0]) => previewEmployeeResume(file, employeeResumeReader),
  importResume: (draft: EmployeeResumeDraft, actor: ImportActor) => importEmployeeResume(draft, actor, { append: appendEmployeeData, recordFailedImport }, new Date().toISOString().slice(0, 10)),
  importResumes: (drafts: EmployeeResumeDraft[], actor: ImportActor) => importEmployeeResumes(drafts, actor, { append: appendEmployeeData, recordFailedImport }, new Date().toISOString().slice(0, 10)),
  deleteEmployees: (versionId: string, ids: string[] | null, actor: ImportActor) => deleteEmployeeRecords(versionId, ids, actor, { delete: deleteEmployees }),
  list: (input: { page?: number; search?: string }) => listEmployees(input, { list: listCurrentEmployees, find: findEmployeeProfile }),
  getProfile: (employeeId: string, versionId: string) => getEmployeeProfile(employeeId, versionId, { list: listCurrentEmployees, find: findEmployeeProfile }),
  getOverview: () => getEmployeeDataOverview(repository),
  importWorkbook: (command: ImportEmployeeWorkbookCommand) =>
    importEmployeeWorkbook(command, {
      parser: { parse: parseEmployeeWorkbook },
      repository,
    }),
  previewWorkbook: (file: ImportEmployeeWorkbookCommand["file"]) => previewEmployeeWorkbook(file, { parse: parseEmployeeWorkbook }),
};
