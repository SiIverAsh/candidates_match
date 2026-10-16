import assert from "node:assert/strict";

import { evaluateDataset, EvaluationVersionMismatchError } from "../src/modules/evaluation";
import type { EvaluationDataset } from "../src/modules/evaluation";
import {
  EvaluationDatasetValidationError,
  parseEvaluationDataset,
} from "../src/modules/evaluation";
import type { EmployeeSnapshot } from "../src/modules/matching/application/ports";
import { MATCHING_CONFIG } from "../src/modules/matching/domain/config";
import { NORMALIZER_VERSION, PARSER_VERSION } from "../src/modules/resume-parser";
import type { ResumeSource } from "../src/modules/resume-parser/domain/models";
import { parseResumeText } from "../src/modules/resume-parser/infrastructure/parsing/parse-resume-text";

const submittedAt = "2026-09-29T02:00:00.000Z";
const expiresAt = "2026-10-06T02:00:00.000Z";

function employee(
  employeeId: string,
  overrides: Partial<EmployeeSnapshot>,
): EmployeeSnapshot {
  return {
    employeeId,
    name: `真实员工姓名-${employeeId}`,
    email: `${employeeId.toLowerCase()}@sensitive.example.com`,
    currentDepartment: "敏感部门",
    currentTitle: "敏感职位",
    workExperiences: [],
    educations: [],
    ...overrides,
  };
}

const employees = [
  employee("E-TRUE", {
    educations: [{
      sequence: 0,
      school: "北京大学",
      major: "计算机科学与技术",
      startDate: "2017-09-01",
      endDate: "2020-06-30",
    }],
  }),
  employee("E-NO-SIGNAL", {}),
];

function profile(caseId: string) {
  const source: ResumeSource = {
    queryId: caseId,
    submittedBy: "offline-evaluation",
    sourceType: "TEXT",
    sourceFormat: "plain-text",
    text: null,
    bytes: null,
    expiresAt,
  };
  return parseResumeText(source, [
    "姓名：敏感候选人姓名",
    "教育经历",
    "学校：Peking University",
    "专业：Computer Science",
    "就读时间：2015-2019",
  ].join("\n"), submittedAt);
}

function dataset(truthEmployeeId: string, count = 20): EvaluationDataset {
  return {
    schemaVersion: "evaluation-dataset-v1",
    datasetId: "evaluation-labelled-fixture",
    datasetVersion: "fixture-v1",
    versions: {
      employeeVersionId: "employee-snapshot-v1",
      parserVersion: PARSER_VERSION,
      ruleVersion: MATCHING_CONFIG.ruleVersion,
      thresholdVersion: MATCHING_CONFIG.thresholdVersion,
      normalizerVersion: NORMALIZER_VERSION,
      labelPolicyVersion: "verified-relationship-v1",
    },
    employees,
    cases: Array.from({ length: count }, (_, index) => {
      const id = `CASE-${String(index + 1).padStart(2, "0")}`;
      return {
        id,
        submittedAt,
        relationshipScenario: "SAME_SCHOOL_MAJOR_OVERLAP" as const,
        profile: profile(id),
        knownRelationshipEmployeeIds: [truthEmployeeId],
      };
    }),
    prototypeValidation: {
      participantCount: 5,
      successfulParticipantCount: 4,
    },
  };
}

const passingDataset = parseEvaluationDataset(JSON.parse(JSON.stringify(dataset("E-TRUE"))));
const passingReport = evaluateDataset(passingDataset, {
  datasetFingerprint: "fixture-sha256",
  evaluatedAt: "2026-09-29T03:00:00.000Z",
});
assert.equal(passingReport.metrics.caseCount, 20);
assert.deepEqual(passingReport.metrics.top5, { numerator: 20, denominator: 20, rate: 1 });
assert.deepEqual(
  passingReport.metrics.highConfidencePrecision,
  { numerator: 20, denominator: 20, rate: 1 },
);
assert.equal(passingReport.gates.offlinePassed, true);
assert.equal(passingReport.gates.overallPassed, true);
assert.equal(passingReport.errors.length, 0);
assert.equal(
  passingReport.scenarioMetrics.find(
    (metric) => metric.scenario === "SAME_SCHOOL_MAJOR_OVERLAP",
  )?.caseCount,
  20,
);

const serializedReport = JSON.stringify(passingReport);
assert.equal(serializedReport.includes("真实员工姓名"), false);
assert.equal(serializedReport.includes("@sensitive.example.com"), false);
assert.equal(serializedReport.includes("敏感候选人姓名"), false);

const failingReport = evaluateDataset(
  parseEvaluationDataset(JSON.parse(JSON.stringify(dataset("E-NO-SIGNAL")))),
  {
    datasetFingerprint: "failing-fixture-sha256",
    evaluatedAt: "2026-09-29T03:00:00.000Z",
  },
);
assert.equal(failingReport.metrics.top5.rate, 0);
assert.equal(failingReport.metrics.highConfidencePrecision.rate, 0);
assert.equal(failingReport.gates.offlinePassed, false);
assert.equal(failingReport.gates.overallPassed, false);
assert.equal(
  failingReport.errors.filter((item) => item.kind === "KNOWN_RELATION_NOT_RECOMMENDED").length,
  20,
);
assert.equal(
  failingReport.errors.filter((item) => item.kind === "HIGH_CONFIDENCE_FALSE_POSITIVE").length,
  20,
);
assert.ok(
  failingReport.recommendations.some(
    (item) => item.code === "IMPROVE_RECALL_AND_NORMALIZATION",
  ),
);
assert.ok(
  failingReport.recommendations.some(
    (item) => item.code === "TIGHTEN_HIGH_CONFIDENCE_RULES",
  ),
);

const insufficientReport = evaluateDataset(
  parseEvaluationDataset(JSON.parse(JSON.stringify(dataset("E-TRUE", 1)))),
  {
    datasetFingerprint: "small-fixture-sha256",
    evaluatedAt: "2026-09-29T03:00:00.000Z",
  },
);
assert.equal(insufficientReport.gates.offlinePassed, false);
assert.equal(
  insufficientReport.gates.offline.find(
    (gate) => gate.name === "MINIMUM_SAMPLE_SIZE",
  )?.passed,
  false,
);

assert.throws(
  () => evaluateDataset(
    { ...passingDataset, versions: { ...passingDataset.versions, ruleVersion: "wrong-rule" } },
    { datasetFingerprint: "fixture", evaluatedAt: submittedAt },
  ),
  EvaluationVersionMismatchError,
);

assert.throws(
  () => parseEvaluationDataset({
    ...JSON.parse(JSON.stringify(dataset("E-TRUE", 1))),
    prototypeValidation: { participantCount: 4, successfulParticipantCount: 5 },
  }),
  EvaluationDatasetValidationError,
);

console.log("Evaluation verification passed");
