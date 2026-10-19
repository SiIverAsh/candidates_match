import { getEmployeeDataOverview, publishEmployeeData } from "../src/modules/employee-data/infrastructure/sqlite/repository";
import { createBiopharmaEmployees } from "./fixtures/biopharma-employees";

if (getEmployeeDataOverview().activeVersion) {
  throw new Error("已有员工数据版本，停止导入测试数据。");
}

const data = createBiopharmaEmployees();

const version = publishEmployeeData(data, { id: "local-test-seed", displayName: "本地测试数据导入" });
console.log(JSON.stringify(version, null, 2));
