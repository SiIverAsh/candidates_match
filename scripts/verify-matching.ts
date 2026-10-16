import assert from "node:assert/strict";

import type { EmployeeSnapshot, MatchingContext } from "../src/modules/matching/application/ports";
import { runMatchingEngine } from "../src/modules/matching/domain/engine";
import { parseResumeText } from "../src/modules/resume-parser/infrastructure/parsing/parse-resume-text";
import type { ResumeSource } from "../src/modules/resume-parser/domain/models";

const submittedAt = "2026-09-24T08:00:00.000Z";
const expiresAt = "2026-10-01T08:00:00.000Z";
const source: ResumeSource = {
  queryId: "query-matching",
  submittedBy: "test-user",
  sourceType: "TEXT",
  sourceFormat: "plain-text",
  text: null,
  bytes: null,
  expiresAt,
};
const resume = [
  "姓名：候选人",
  "工作经历",
  "公司：示例科技有限公司",
  "职位：高级产品经理",
  "任职时间：2019-2021",
  "教育经历",
  "学校：Peking University",
  "专业：Computer Science",
  "就读时间：2015-2019",
].join("\n");
const profile = parseResumeText(source, resume, submittedAt);

function employee(
  employeeId: string,
  overrides: Partial<EmployeeSnapshot>,
): EmployeeSnapshot {
  return {
    employeeId,
    name: `员工 ${employeeId}`,
    email: `${employeeId.toLowerCase()}@example.com`,
    currentDepartment: "当前部门不参与历史匹配",
    currentTitle: "经理",
    workExperiences: [],
    educations: [],
    ...overrides,
  };
}

const employees: EmployeeSnapshot[] = [
  employee("E001", {
    educations: [{
      sequence: 0,
      school: "北京大学",
      major: "计算机科学与技术",
      startDate: "2017-09-01",
      endDate: "2020-06-30",
    }],
  }),
  employee("E002", {
    workExperiences: [
      {
        sequence: 0,
        company: "示例科技有限公司",
        title: "Product Manager",
        startDate: "2019-01-01",
        endDate: "2021-12-31",
      },
      {
        sequence: 1,
        company: "示例科技有限公司",
        title: "Product Manager",
        startDate: "2019-01-01",
        endDate: "2021-12-31",
      },
    ],
  }),
  employee("E003", {
    workExperiences: [{
      sequence: 0,
      company: "示例科技",
      title: "销售经理",
      startDate: "2020-01-01",
      endDate: "2022-12-31",
    }],
  }),
  employee("E004", {
    workExperiences: [{
      sequence: 0,
      company: "完全不同公司",
      title: "高级产品经理",
      startDate: "2019-01-01",
      endDate: "2021-12-31",
    }],
  }),
  employee("E005", {
    educations: [{
      sequence: 0,
      school: "Peking University",
      major: "市场营销",
      startDate: "2021-09-01",
      endDate: "2025-06-30",
    }],
  }),
  employee("E006", {
    workExperiences: [{
      sequence: 0,
      company: "示例科技有限公司",
      title: "Product Manager",
      startDate: "2010-01-01",
      endDate: "2012-12-31",
    }],
  }),
  employee("E007", {
    workExperiences: [{
      sequence: 0,
      company: "示例科技有限公司",
      title: "销售经理",
      startDate: "2020-01-01",
      endDate: "2022-12-31",
    }],
  }),
];

const context: MatchingContext = {
  queryId: source.queryId,
  submittedBy: source.submittedBy,
  submittedAt,
  expiresAt,
  employeeVersionId: "employee-v1",
  profile,
  employees,
};
const run = runMatchingEngine(context, "run-1", submittedAt);
assert.equal(run.status, "COMPLETED");
assert.equal(run.employeeVersionId, "employee-v1");
assert.equal(run.ruleVersion, "matching-rules-v1");
assert.equal(run.thresholdVersion, "confidence-v1");
assert.equal(run.expiresAt, expiresAt);
assert.equal(run.resultCount, 6);
assert.equal(run.results[0]?.employeeId, "E001");
assert.equal(run.results[0]?.confidence, "HIGH");
assert.equal(run.results[0]?.evidence[0]?.type, "EDUCATION_SCHOOL_MAJOR_OVERLAP");
assert.equal(run.results[0]?.evidence[0]?.overlap?.precision, "YEAR");
assert.match(run.results[0]?.evidence[0]?.reason ?? "", /年份精度/u);

const medium = run.results.find((item) => item.employeeId === "E002");
assert.equal(medium?.score, 45);
assert.equal(medium?.evidence.length, 1, "重复履历行不能重复加分");
assert.equal(medium?.confidence, "MEDIUM");
assert.equal(medium?.evidence[0]?.type, "WORK_COMPANY_FUNCTION_OVERLAP");

const differentFunction = run.results.find((item) => item.employeeId === "E003");
assert.equal(differentFunction?.score, 25);
assert.equal(differentFunction?.confidence, "LOW");
assert.ok(differentFunction?.evidence.every((item) => !item.reason.includes("部门")));

assert.equal(run.results.some((item) => item.employeeId === "E004"), false);
assert.equal(run.results.find((item) => item.employeeId === "E005")?.score, 15);
assert.equal(run.results.find((item) => item.employeeId === "E006")?.score, 10);
assert.ok(
  (run.results.findIndex((item) => item.employeeId === "E003")) <
  (run.results.findIndex((item) => item.employeeId === "E007")),
  "同分结果应按 employee_id 稳定排序",
);

const noResults = runMatchingEngine({
  ...context,
  employees: [employees[3]],
}, "run-2", submittedAt);
assert.equal(noResults.status, "NO_RESULTS");
assert.deepEqual(noResults.results, []);

const skipped = runMatchingEngine({
  ...context,
  profile: { ...profile, parseStatus: "INSUFFICIENT" },
}, "run-3", submittedAt);
assert.equal(skipped.status, "SKIPPED_INSUFFICIENT");
assert.equal(skipped.resultCount, 0);

console.log("Matching verification passed");
