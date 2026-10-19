import type { ParsedEmployeeData } from "../../src/modules/employee-data/domain/models";

// Synthetic people and employers for local demonstrations. ARD means Analytical Research & Development.
const examples = [
  ["周予安", "明澈免疫生物医药有限公司", "免疫学研究员", "北京大学", "免疫学", "免疫研究部"],
  ["韩知微", "明澈免疫生物医药有限公司", "肿瘤免疫研究员", "浙江大学", "肿瘤学", "肿瘤免疫部"],
  ["程书衡", "启衡靶向药物有限公司", "靶向药物研究员", "复旦大学", "药物化学", "靶向药物研发部"],
  ["叶清和", "启衡靶向药物有限公司", "药理研究员", "上海交通大学", "药理学", "药理研究部"],
  ["宋亦舟", "澜序分析研发有限公司", "ARD 分析研究员", "中国药科大学", "药物分析", "ARD 分析研发部"],
  ["许知夏", "澜序分析研发有限公司", "ARD 方法研究员", "浙江大学", "分析化学", "ARD 方法研究部"],
  ["Taylor Avery", "ClearSpring Immunology Ltd.", "Immunology Research Scientist", "Stanford University", "Immunology", "Immunology Research"],
  ["Jordan Ellis", "Meridian Oncology Ltd.", "Oncology Research Scientist", "Harvard University", "Cancer Biology", "Oncology Research"],
  ["Casey Rowan", "Northbridge Therapeutics Ltd.", "Targeted Drug Research Scientist", "Peking University", "Pharmacology", "Targeted Drug Discovery"],
  ["Riley Quinn", "Lanse Analytical Sciences Ltd.", "ARD Analytical Research Scientist", "Tsinghua University", "Analytical Chemistry", "Analytical R&D"],
];

export function createBiopharmaEmployees(): ParsedEmployeeData {
  const data: ParsedEmployeeData = { employees: [], workExperiences: [], educationExperiences: [] };
  examples.forEach(([name, company, title, school, major, department], index) => {
    const employeeId = `TEST-${String(index + 1).padStart(3, "0")}`;
    data.employees.push({ employeeId, name: `${name}（虚构）`, email: `test.employee${index + 1}@example.com`, currentDepartment: department, currentTitle: title });
    data.workExperiences.push({ employeeId, company, title, startDate: "2020-01-01", endDate: "2024-12-31" });
    data.educationExperiences.push({ employeeId, school, major, startDate: "2016-09-01", endDate: "2020-06-30" });
  });
  return data;
}
