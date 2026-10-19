import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InlineMatchResults } from "../src/modules/results/presentation/components/inline-match-results";

import type { EmployeeMatchResult, MatchRun } from "../src/modules/matching/domain/models";
import {
  groupMatchResults,
  isGroupInitiallyOpen,
} from "../src/modules/results/domain/group-results";

function result(
  employeeId: string,
  rank: number,
  confidence: EmployeeMatchResult["confidence"],
): EmployeeMatchResult {
  return {
    employeeId,
    name: `员工 ${employeeId}`,
    email: `${employeeId.toLowerCase()}@example.com`,
    currentDepartment: "商业化",
    currentTitle: "经理",
    rank,
    score: confidence === "HIGH" ? 80 : confidence === "MEDIUM" ? 50 : 20,
    confidence,
    evidence: [{
      id: `evidence-${employeeId}`,
      type: "WORK_COMPANY_OVERLAP",
      strength: "WEAK",
      score: 25,
      candidateSourceFields: ["workExperiences[0].company.raw"],
      employeeSourceFields: ["work_experiences[0].company"],
      normalizedValues: { company: "示例公司" },
      overlap: { start: "2020", end: "2021", precision: "YEAR", months: null },
      reason: "两人曾在示例公司任职；原始资料仅提供年份精度。",
    }],
  };
}

const sourceOrder = [
  result("E003", 3, "LOW"),
  result("E002", 2, "HIGH"),
  result("E001", 1, "HIGH"),
  result("E004", 4, "MEDIUM"),
];
const run: MatchRun = {
  id: "run-results",
  queryId: "query-results",
  employeeVersionId: "employee-v1",
  status: "COMPLETED",
  resultCount: sourceOrder.length,
  results: sourceOrder,
  ruleVersion: "matching-rules-v1",
  thresholdVersion: "confidence-v1",
  normalizerVersion: "entity-rules-v1",
  submittedAt: "2026-09-28T02:00:00.000Z",
  createdAt: "2026-09-28T02:00:01.000Z",
  expiresAt: "2026-10-05T02:00:00.000Z",
};

const groups = groupMatchResults(run);
assert.deepEqual(groups.map((group) => group.confidence), ["HIGH", "MEDIUM", "LOW"]);
assert.deepEqual(groups.map((group) => group.label), ["高置信度", "中置信度", "低置信度"]);
assert.deepEqual(groups[0].results.map((item) => item.employeeId), ["E001", "E002"]);
assert.deepEqual(groups[1].results.map((item) => item.employeeId), ["E004"]);
assert.deepEqual(groups[2].results.map((item) => item.employeeId), ["E003"]);
assert.deepEqual(
  groups.flatMap((group) => group.results).map((item) => item.employeeId).sort(),
  ["E001", "E002", "E003", "E004"],
  "所有有证据结果必须恰好展示一次",
);
assert.deepEqual(sourceOrder.map((item) => item.employeeId), ["E003", "E002", "E001", "E004"]);
assert.equal(isGroupInitiallyOpen("HIGH"), true);
assert.equal(isGroupInitiallyOpen("MEDIUM"), false);
assert.equal(isGroupInitiallyOpen("LOW"), false);

const emptyGroups = groupMatchResults({ ...run, status: "NO_RESULTS", resultCount: 0, results: [] });
assert.deepEqual(emptyGroups.map((group) => group.results.length), [0, 0, 0]);

const inline = renderToStaticMarkup(createElement(InlineMatchResults, { run }));
assert.equal((inline.match(/class="confidence-group (?:high|medium|low)" open=""/g) ?? []).length, 3,
  "单份简历结果应默认展开高、中、低三组");
for (const employee of sourceOrder) {
  assert.ok(inline.includes(employee.name));
  assert.ok(inline.includes(employee.email));
  assert.ok(inline.includes(employee.currentDepartment));
  assert.ok(inline.includes(employee.currentTitle));
  assert.ok(inline.includes(employee.evidence[0].reason));
}
const noResults = renderToStaticMarkup(createElement(InlineMatchResults, {
  run: { ...run, status: "NO_RESULTS", resultCount: 0, results: [] },
}));
assert.ok(noResults.includes("暂未找到有共同经历的员工"));
assert.equal((noResults.match(/该置信度暂无结果/g) ?? []).length, 3);
const insufficient = renderToStaticMarkup(createElement(InlineMatchResults, {
  run: { ...run, status: "SKIPPED_INSUFFICIENT", resultCount: 0, results: [] },
}));
assert.ok(insufficient.includes("有效经历不足"));
assert.ok(!insufficient.includes("暂未找到有共同经历的员工"));

console.log("Results verification passed (including inline employee cards and empty/insufficient states)");
