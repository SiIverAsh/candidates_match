import { getEmployeeDataOverview } from "./application/get-employee-data-overview";
import { getEmployeeProfile, listEmployees } from "./application/browse-employees";
import {
  importEmployeeWorkbook,
  type ImportEmployeeWorkbookCommand,
} from "./application/import-employee-workbook";
import { parseEmployeeWorkbook } from "./infrastructure/excel/parse-workbook";
import {
  getEmployeeDataOverview as readOverview,
  publishEmployeeData,
  recordFailedImport,
  listCurrentEmployees,
  findEmployeeProfile,
} from "./infrastructure/sqlite/repository";

const repository = {
  getOverview: readOverview,
  publishEmployeeData,
  recordFailedImport,
};

export const employeeDataApplication = {
  list: (input: { page?: number; search?: string }) => listEmployees(input, { list: listCurrentEmployees, find: findEmployeeProfile }),
  getProfile: (employeeId: string, versionId: string) => getEmployeeProfile(employeeId, versionId, { list: listCurrentEmployees, find: findEmployeeProfile }),
  getOverview: () => getEmployeeDataOverview(repository),
  importWorkbook: (command: ImportEmployeeWorkbookCommand) =>
    importEmployeeWorkbook(command, {
      parser: { parse: parseEmployeeWorkbook },
      repository,
    }),
};
