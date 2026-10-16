import { getEmployeeDataOverview, publishEmployeeData } from "../src/modules/employee-data/infrastructure/sqlite/repository";
import type { ParsedEmployeeData } from "../src/modules/employee-data/domain/models";

if (getEmployeeDataOverview().activeVersion) {
  throw new Error("已有员工数据版本，停止导入测试数据。");
}

const examples = [
  ["腾讯", "产品经理", "北京大学", "计算机科学"],
  ["腾讯", "软件工程师", "清华大学", "计算机科学"],
  ["阿里巴巴", "产品经理", "浙江大学", "计算机科学"],
  ["阿里巴巴", "数据分析师", "北京大学", "统计学"],
  ["字节跳动", "软件工程师", "复旦大学", "计算机科学"],
  ["字节跳动", "人力资源经理", "中国人民大学", "人力资源管理"],
  ["华为", "研发工程师", "清华大学", "电子工程"],
  ["华为", "项目经理", "上海交通大学", "软件工程"],
  ["百济神州", "分析研发科学家", "复旦大学", "药学"],
  ["百济神州", "质量分析经理", "浙江大学", "化学"],
];

const data: ParsedEmployeeData = { employees: [], workExperiences: [], educationExperiences: [] };
examples.forEach(([company, title, school, major], index) => {
  const employeeId = `TEST-${String(index + 1).padStart(3, "0")}`;
  data.employees.push({ employeeId, name: `测试员工${index + 1}（虚构）`, email: `test.employee${index + 1}@example.com`, currentDepartment: "测试部门", currentTitle: title });
  data.workExperiences.push({ employeeId, company, title, startDate: "2020-01-01", endDate: "2024-12-31" });
  data.educationExperiences.push({ employeeId, school, major, startDate: "2016-09-01", endDate: "2020-06-30" });
});

const version = publishEmployeeData(data, { id: "local-test-seed", displayName: "本地测试数据导入" });
console.log(JSON.stringify(version, null, 2));
