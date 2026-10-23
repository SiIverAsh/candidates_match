import assert from "node:assert/strict";

import type { EmployeeSnapshot, MatchingContext } from "../src/modules/matching/application/ports";
import { runMatchingEngine } from "../src/modules/matching/domain/engine";
import { parseResumeText } from "../src/modules/resume-parser/infrastructure/parsing/parse-resume-text";
import type { ResumeSource } from "../src/modules/resume-parser/domain/models";
import { isSamePerson, normalizePersonProfileUrl } from "../src/shared/domain/person-identity";

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
assert.equal(run.ruleVersion, "matching-rules-v4");
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
assert.equal(medium?.relationshipScore, 25);
assert.equal(medium?.functionSimilarity?.bonus, 20);
assert.equal(medium?.functionSimilarity?.status, "SAME_CATEGORY");
assert.equal(medium?.functionSimilarity?.comparisons.length, 1, "重复履历不能重复生成职能比较");
assert.equal(medium?.evidence.length, 1, "重复履历行不能重复加分");
assert.equal(medium?.confidence, "MEDIUM");
assert.equal(medium?.evidence[0]?.type, "WORK_COMPANY_OVERLAP");
assert.equal(medium?.evidence[0]?.score, 25, "经历证据不得包含职能加分");

const differentFunction = run.results.find((item) => item.employeeId === "E003");
assert.equal(differentFunction?.score, 25);
assert.equal(differentFunction?.confidence, "LOW");
assert.equal(differentFunction?.relationshipScore, medium?.relationshipScore, "相同的经历信号应独立于职能比较");
assert.equal(differentFunction?.functionSimilarity?.status, "DIFFERENT_CATEGORY");
assert.equal(differentFunction?.functionSimilarity?.bonus, 0);
assert.ok(differentFunction?.evidence.every((item) => !item.reason.includes("部门")));

assert.equal(run.results.some((item) => item.employeeId === "E004"), false);
assert.equal(run.results.find((item) => item.employeeId === "E005")?.score, 15);
assert.equal(run.results.find((item) => item.employeeId === "E006")?.score, 10);
assert.equal(run.results.find((item) => item.employeeId === "E006")?.functionSimilarity?.status, "SAME_CATEGORY");
assert.equal(run.results.find((item) => item.employeeId === "E006")?.functionSimilarity?.bonus, 0, "无时间重叠不能通过同职能加分");
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

for (const title of ["", "未识别职位", "产品研究员"]) {
  const unknown = runMatchingEngine({ ...context, employees: [employee("UNKNOWN", {
    workExperiences: [{ ...employees[1].workExperiences[0], title }],
  })] }, "unknown", submittedAt).results[0];
  assert.equal(unknown.score, 25);
  assert.equal(unknown.functionSimilarity?.status, "UNKNOWN");
  assert.equal(unknown.functionSimilarity?.bonus, 0, "缺失、未知或多义职能不得加分");
}

const secondCompany = { ...profile.workExperiences[0], sequence: 1, company: { ...profile.workExperiences[0].company, raw: "另一公司", value: "另一公司" } };
const workOnly = runMatchingEngine({
  ...context, profile: { ...profile, educations: [], workExperiences: [...profile.workExperiences, secondCompany] },
  employees: [employee("TWO-COMPANIES", { workExperiences: [employees[1].workExperiences[0], { ...employees[1].workExperiences[0], sequence: 1, company: "另一公司" }] })],
}, "work-only", submittedAt).results[0];
assert.equal(workOnly.score, 90);
assert.equal(workOnly.relationshipScore, 50);
assert.equal(workOnly.functionSimilarity?.bonus, 40);
assert.equal(workOnly.confidence, "MEDIUM", "多段工作经历和职能加分不能绕过高置信度强证据门槛");

const incompleteEmployeeDates = runMatchingEngine({ ...context, employees: [employee("UNKNOWN-END", {
  workExperiences: [{ ...employees[1].workExperiences[0], startDate: "2019", endDate: null, current: false }],
})] }, "unknown-end", submittedAt).results[0];
assert.equal(incompleteEmployeeDates.score, 10, "结束时间未知不能按至今产生重叠或职能加分");
assert.equal(incompleteEmployeeDates.evidence[0].overlap, null);
const yearPrecision = runMatchingEngine({ ...context, employees: [employee("YEAR-END", {
  workExperiences: [{ ...employees[1].workExperiences[0], startDate: "2020", endDate: "2021", current: false }],
})] }, "year-end", submittedAt).results[0];
assert.equal(yearPrecision.evidence[0].overlap?.precision, "YEAR");
assert.equal(yearPrecision.evidence[0].overlap?.months, null);

assert.equal(normalizePersonProfileUrl("http://uk.linkedin.com/in/Self-Person/details/experience/?trk=abc#top"), "linkedin.com/in/self-person");
assert.equal(isSamePerson({ email: " Person@Example.com " }, { email: "person@example.com" }), true);
assert.equal(isSamePerson({ profileUrl: "https://linkedin.com/in/self-person/" }, { profileUrl: "http://www.linkedin.com/in/Self-Person?trk=abc" }), true);
assert.equal(isSamePerson({ employeeId: "E001" }, { employeeId: "E001" }), true);
assert.equal(isSamePerson({ resumeFingerprint: "same-resume" }, { resumeFingerprint: "same-resume" }), true);
assert.equal(isSamePerson({ email: "" }, { email: "" }), false);
assert.equal(isSamePerson({ email: "未提供" }, { email: "未提供" }), false);
assert.equal(isSamePerson({ profileUrl: "https://linkedin.com/company/example" }, { profileUrl: "https://linkedin.com/company/example" }), false);
assert.equal(isSamePerson({ profileUrl: "https://example.com/person?id=1" }, { profileUrl: "https://example.com/person?id=2" }), false, "通用站点的身份查询参数不能被删除");

for (const identity of [
  { employeeId: "E001" },
  { email: "e001@example.com" },
  { profileUrl: "https://linkedin.com/in/self-person" },
  { resumeFingerprint: "same-resume" },
]) {
  const selfExcluded = runMatchingEngine({ ...context, profile: { ...profile, identity }, employees: [
    { ...employees[0], profileUrl: "http://www.linkedin.com/in/Self-Person/?trk=test", resumeFingerprint: "same-resume" },
    { ...employees[0], employeeId: "COWORKER", name: "其他同事", email: "coworker@example.com", profileUrl: "https://linkedin.com/in/another-person", resumeFingerprint: "different-resume" },
  ] }, "self-excluded", submittedAt);
  assert.equal(selfExcluded.resultCount, 1, "本人必须在打分和计数前排除");
  assert.equal(selfExcluded.results[0].employeeId, "COWORKER");
  assert.equal(selfExcluded.results[0].rank, 1, "过滤后排名必须连续");
}
const sameName = runMatchingEngine({ ...context, employees: [{ ...employees[0], name: profile.candidateName!, email: "different@example.com" }] }, "same-name", submittedAt);
assert.equal(sameName.resultCount, 1, "不能仅凭同名排除不同员工");
const selfOnly = runMatchingEngine({ ...context, profile: { ...profile, identity: { employeeId: "E001" } }, employees: [employees[0]] }, "self-only", submittedAt);
assert.equal(selfOnly.status, "NO_RESULTS");
assert.equal(selfOnly.resultCount, 0);

console.log("Matching verification passed");
