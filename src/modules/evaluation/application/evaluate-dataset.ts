import { MATCHING_CONFIG } from "../../matching/domain/config";
import { runMatchingEngine } from "../../matching/domain/engine";
import type { EmployeeMatchResult } from "../../matching/domain/models";
import { NORMALIZER_VERSION, PARSER_VERSION } from "../../resume-parser";
import {
  RELATIONSHIP_SCENARIOS,
  type EvaluationCase,
  type EvaluationDataset,
  type EvaluationErrorCase,
  type EvaluationGate,
  type EvaluationRecommendation,
  type EvaluationReport,
  type RateMetric,
  type ScenarioMetrics,
} from "../domain/models";

const MINIMUM_SAMPLE_SIZE = 20;
const TOP5_HIT_RATE_THRESHOLD = 0.85;
const HIGH_CONFIDENCE_PRECISION_THRESHOLD = 0.70;
const PROTOTYPE_PARTICIPANT_THRESHOLD = 5;
const PROTOTYPE_SUCCESS_THRESHOLD = 4;

interface EvaluationOptions {
  datasetFingerprint: string;
  evaluatedAt: string;
}

interface CaseOutcome {
  item: EvaluationCase;
  top5Hit: boolean;
  highPredictionCount: number;
  highTruePositiveCount: number;
  errors: EvaluationErrorCase[];
}

export class EvaluationVersionMismatchError extends Error {
  constructor(public readonly mismatches: string[]) {
    super("EVALUATION_VERSION_MISMATCH");
  }
}

function rate(numerator: number, denominator: number): RateMetric {
  return {
    numerator,
    denominator,
    rate: denominator === 0 ? null : numerator / denominator,
  };
}

function passesRate(metric: RateMetric, threshold: number): boolean {
  return metric.denominator > 0 && metric.numerator / metric.denominator >= threshold;
}

function runtimeVersionMismatches(dataset: EvaluationDataset): string[] {
  const mismatches: string[] = [];
  if (dataset.versions.parserVersion !== PARSER_VERSION) {
    mismatches.push("parserVersion");
  }
  if (dataset.versions.ruleVersion !== MATCHING_CONFIG.ruleVersion) {
    mismatches.push("ruleVersion");
  }
  if (dataset.versions.thresholdVersion !== MATCHING_CONFIG.thresholdVersion) {
    mismatches.push("thresholdVersion");
  }
  if (dataset.versions.normalizerVersion !== NORMALIZER_VERSION) {
    mismatches.push("normalizerVersion");
  }
  return mismatches;
}

function errorForKnownRelationship(
  item: EvaluationCase,
  employeeId: string,
  result: EmployeeMatchResult | undefined,
): EvaluationErrorCase {
  return {
    kind: result ? "KNOWN_RELATION_OUTSIDE_TOP5" : "KNOWN_RELATION_NOT_RECOMMENDED",
    caseId: item.id,
    scenario: item.relationshipScenario,
    employeeId,
    rank: result?.rank ?? null,
    score: result?.score ?? null,
    confidence: result?.confidence ?? null,
    evidenceTypes: result?.evidence.map((evidence) => evidence.type) ?? [],
  };
}

function evaluateCase(dataset: EvaluationDataset, item: EvaluationCase): CaseOutcome {
  const run = runMatchingEngine({
    queryId: item.id,
    submittedBy: "offline-evaluation",
    submittedAt: item.submittedAt,
    expiresAt: item.profile.expiresAt,
    employeeVersionId: dataset.versions.employeeVersionId,
    profile: item.profile,
    employees: dataset.employees,
  }, `evaluation-${item.id}`, item.submittedAt);

  const truth = new Set(item.knownRelationshipEmployeeIds);
  const top5 = run.results.slice(0, 5);
  const top5Ids = new Set(top5.map((result) => result.employeeId));
  const high = run.results.filter((result) => result.confidence === "HIGH");
  const errors: EvaluationErrorCase[] = [];

  for (const employeeId of truth) {
    if (!top5Ids.has(employeeId)) {
      errors.push(errorForKnownRelationship(
        item,
        employeeId,
        run.results.find((result) => result.employeeId === employeeId),
      ));
    }
  }
  for (const result of high) {
    if (!truth.has(result.employeeId)) {
      errors.push({
        kind: "HIGH_CONFIDENCE_FALSE_POSITIVE",
        caseId: item.id,
        scenario: item.relationshipScenario,
        employeeId: result.employeeId,
        rank: result.rank,
        score: result.score,
        confidence: result.confidence,
        evidenceTypes: result.evidence.map((evidence) => evidence.type),
      });
    }
  }

  return {
    item,
    top5Hit: top5.some((result) => truth.has(result.employeeId)),
    highPredictionCount: high.length,
    highTruePositiveCount: high.filter((result) => truth.has(result.employeeId)).length,
    errors,
  };
}

function scenarioMetrics(outcomes: CaseOutcome[]): ScenarioMetrics[] {
  return RELATIONSHIP_SCENARIOS.map((scenario): ScenarioMetrics => {
    const selected = outcomes.filter((outcome) => outcome.item.relationshipScenario === scenario);
    return {
      scenario,
      caseCount: selected.length,
      top5: rate(selected.filter((outcome) => outcome.top5Hit).length, selected.length),
      highConfidencePrecision: rate(
        selected.reduce((total, outcome) => total + outcome.highTruePositiveCount, 0),
        selected.reduce((total, outcome) => total + outcome.highPredictionCount, 0),
      ),
    };
  });
}

function recommendations(
  sampleGate: EvaluationGate,
  top5Gate: EvaluationGate,
  highGate: EvaluationGate,
  prototypePassed: boolean,
): EvaluationRecommendation[] {
  const output: EvaluationRecommendation[] = [];
  if (!sampleGate.passed) {
    output.push({
      code: "PREPARE_20_LABELLED_CASES",
      message: "补足至少 20 位已知真实关系候选人后再判断是否达到上线门槛。",
    });
  }
  if (!top5Gate.passed) {
    output.push({
      code: "IMPROVE_RECALL_AND_NORMALIZATION",
      message: "检查员工数据覆盖、实体标准化和弱信号召回，不能通过扩大无证据结果数量补齐。",
    });
  }
  if (!highGate.passed) {
    output.push({
      code: "TIGHTEN_HIGH_CONFIDENCE_RULES",
      message: "提高高置信度阈值或下调错误信号等级，优先减少高置信度误报。",
    });
  }
  if (!prototypePassed) {
    output.push({
      code: "RUN_RECRUITER_PROTOTYPE",
      message: "完成至少 5 位目标用户的受控原型测试，并确保至少 4 位独立完成且认为结果可信有用。",
    });
  }
  return output;
}

export function evaluateDataset(
  dataset: EvaluationDataset,
  options: EvaluationOptions,
): EvaluationReport {
  const mismatches = runtimeVersionMismatches(dataset);
  if (mismatches.length) throw new EvaluationVersionMismatchError(mismatches);

  const outcomes = dataset.cases.map((item) => evaluateCase(dataset, item));
  const top5 = rate(outcomes.filter((outcome) => outcome.top5Hit).length, outcomes.length);
  const highConfidencePrecision = rate(
    outcomes.reduce((total, outcome) => total + outcome.highTruePositiveCount, 0),
    outcomes.reduce((total, outcome) => total + outcome.highPredictionCount, 0),
  );
  const sampleGate: EvaluationGate = {
    name: "MINIMUM_SAMPLE_SIZE",
    passed: outcomes.length >= MINIMUM_SAMPLE_SIZE,
    actual: outcomes.length,
    required: MINIMUM_SAMPLE_SIZE,
  };
  const top5Gate: EvaluationGate = {
    name: "TOP5_HIT_RATE",
    passed: passesRate(top5, TOP5_HIT_RATE_THRESHOLD),
    actual: top5.rate,
    required: TOP5_HIT_RATE_THRESHOLD,
  };
  const highGate: EvaluationGate = {
    name: "HIGH_CONFIDENCE_PRECISION",
    passed: passesRate(highConfidencePrecision, HIGH_CONFIDENCE_PRECISION_THRESHOLD),
    actual: highConfidencePrecision.rate,
    required: HIGH_CONFIDENCE_PRECISION_THRESHOLD,
  };
  const prototype = dataset.prototypeValidation;
  const prototypeGate = {
    name: "PROTOTYPE_VALIDATION" as const,
    passed: Boolean(
      prototype &&
      prototype.participantCount >= PROTOTYPE_PARTICIPANT_THRESHOLD &&
      prototype.successfulParticipantCount >= PROTOTYPE_SUCCESS_THRESHOLD
    ),
    participantCount: prototype?.participantCount ?? 0,
    successfulParticipantCount: prototype?.successfulParticipantCount ?? 0,
    requiredParticipants: PROTOTYPE_PARTICIPANT_THRESHOLD,
    requiredSuccessfulParticipants: PROTOTYPE_SUCCESS_THRESHOLD,
  };
  const offlineGates = [sampleGate, top5Gate, highGate];
  const offlinePassed = offlineGates.every((gate) => gate.passed);
  const errors = outcomes
    .flatMap((outcome) => outcome.errors)
    .sort((left, right) =>
      left.caseId.localeCompare(right.caseId) ||
      left.kind.localeCompare(right.kind) ||
      left.employeeId.localeCompare(right.employeeId)
    );

  return {
    schemaVersion: "evaluation-report-v1",
    datasetId: dataset.datasetId,
    datasetVersion: dataset.datasetVersion,
    datasetFingerprint: options.datasetFingerprint,
    evaluatedAt: options.evaluatedAt,
    versions: dataset.versions,
    metrics: {
      caseCount: outcomes.length,
      top5,
      highConfidencePrecision,
    },
    scenarioMetrics: scenarioMetrics(outcomes),
    errors,
    gates: {
      offline: offlineGates,
      prototype: prototypeGate,
      offlinePassed,
      overallPassed: offlinePassed && prototypeGate.passed,
    },
    recommendations: recommendations(sampleGate, top5Gate, highGate, prototypeGate.passed),
  };
}
