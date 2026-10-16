import type { ProductModule } from "../module.types";

export const employeeDataModule: ProductModule = {
  id: "employee-data",
  name: "员工数据导入与版本",
  stage: "foundation",
  description: "校验、发布并追踪员工履历数据版本。",
};

export { EmployeeDataPage } from "./presentation/pages/employee-data-page";
export type {
  EmployeeDataOverview,
  EmployeeDataVersionSummary,
} from "./domain/models";
export type { ImportActionState } from "./presentation/contracts";
export type { ImportValidationIssue } from "./application/ports";

