import { z } from "zod";

import type { EvaluationDataset } from "../../domain/models";
import { RELATIONSHIP_SCENARIOS } from "../../domain/models";
import { validEmployeeDate } from "../../../employee-data/domain/resume-import";

const normalizedValueSchema = z.object({
  raw: z.string().nullable(),
  value: z.string().nullable(),
  alternatives: z.array(z.string()),
  confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
  method: z.enum(["ALIAS", "RULE", "KEYWORD", "UNRESOLVED"]),
}).strict();

const dateRangeSchema = z.object({
  raw: z.string().nullable(),
  start: z.string().nullable(),
  end: z.string().nullable(),
  startPrecision: z.enum(["DAY", "MONTH", "YEAR", "UNKNOWN"]),
  endPrecision: z.enum(["DAY", "MONTH", "YEAR", "UNKNOWN"]),
  current: z.boolean(),
}).strict();

const identitySchema = z.object({
  employeeId: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  profileUrl: z.string().nullable().optional(),
  resumeFingerprint: z.string().nullable().optional(),
}).strict();

const candidateProfileSchema = z.object({
  queryId: z.string().min(1),
  sourceType: z.enum(["FILE", "TEXT"]),
  sourceFormat: z.string().min(1),
  candidateName: z.string().nullable(),
  identity: identitySchema.optional(),
  parseStatus: z.enum(["COMPLETE", "PARTIAL"]),
  completeness: z.object({
    hasName: z.boolean(),
    hasWorkExperience: z.boolean(),
    hasEducation: z.boolean(),
    hasIncompleteWorkFields: z.boolean(),
    hasIncompleteEducationFields: z.boolean(),
    hasMissingDates: z.boolean(),
  }).strict(),
  warnings: z.array(z.string()),
  workExperiences: z.array(z.object({
    sequence: z.number().int().nonnegative(),
    company: normalizedValueSchema,
    rawTitle: z.string().nullable(),
    description: z.string().optional(),
    normalizedFunction: normalizedValueSchema,
    dates: dateRangeSchema,
  }).strict()),
  educations: z.array(z.object({
    sequence: z.number().int().nonnegative(),
    school: normalizedValueSchema,
    major: normalizedValueSchema,
    degree: z.string().nullable().optional(),
    dates: dateRangeSchema,
  }).strict()),
  parserVersion: z.string().min(1),
  normalizerVersion: z.string().min(1),
  parsedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
}).strict();

const employeeDateSchema = z.string().refine(value => validEmployeeDate(value, "2099-12-31"));
const employeeSchema = z.object({
  employeeId: z.string().min(1),
  name: z.string().min(1),
  email: z.union([z.string().email(), z.literal("")]),
  profileUrl: z.string().nullable().optional(),
  resumeFingerprint: z.string().nullable().optional(),
  currentDepartment: z.string(),
  currentTitle: z.string(),
  workExperiences: z.array(z.object({
    sequence: z.number().int().nonnegative(),
    company: z.string().min(1),
    title: z.string(),
    startDate: employeeDateSchema,
    endDate: employeeDateSchema.nullable(),
    current: z.boolean().optional(),
  }).strict()),
  educations: z.array(z.object({
    sequence: z.number().int().nonnegative(),
    school: z.string().min(1),
    major: z.string(),
    startDate: employeeDateSchema,
    endDate: employeeDateSchema.nullable(),
    current: z.boolean().optional(),
  }).strict()),
}).strict();

const datasetSchema = z.object({
  schemaVersion: z.literal("evaluation-dataset-v1"),
  datasetId: z.string().min(1),
  datasetVersion: z.string().min(1),
  versions: z.object({
    employeeVersionId: z.string().min(1),
    parserVersion: z.string().min(1),
    ruleVersion: z.string().min(1),
    thresholdVersion: z.string().min(1),
    normalizerVersion: z.string().min(1),
    labelPolicyVersion: z.string().min(1),
  }).strict(),
  employees: z.array(employeeSchema).min(1),
  cases: z.array(z.object({
    id: z.string().min(1),
    submittedAt: z.string().datetime(),
    relationshipScenario: z.enum(RELATIONSHIP_SCENARIOS),
    profile: candidateProfileSchema,
    knownRelationshipEmployeeIds: z.array(z.string().min(1)).min(1),
  }).strict()).min(1),
  prototypeValidation: z.object({
    participantCount: z.number().int().nonnegative(),
    successfulParticipantCount: z.number().int().nonnegative(),
  }).strict().optional(),
}).strict();

export class EvaluationDatasetValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super("EVALUATION_DATASET_INVALID");
  }
}

function duplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const repeated = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) repeated.add(value);
    seen.add(value);
  }
  return [...repeated].sort();
}

export function parseEvaluationDataset(value: unknown): EvaluationDataset {
  const parsed = datasetSchema.safeParse(value);
  if (!parsed.success) {
    throw new EvaluationDatasetValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join(".") || "dataset"}: ${issue.code}`),
    );
  }

  const dataset = parsed.data as EvaluationDataset;
  const issues: string[] = [];
  const repeatedEmployees = duplicates(dataset.employees.map((employee) => employee.employeeId));
  if (repeatedEmployees.length) issues.push("employees: duplicate employeeId");
  const repeatedCases = duplicates(dataset.cases.map((item) => item.id));
  if (repeatedCases.length) issues.push("cases: duplicate id");
  const employeeIds = new Set(dataset.employees.map((employee) => employee.employeeId));

  dataset.cases.forEach((item, index) => {
    if (item.profile.queryId !== item.id) {
      issues.push(`cases.${index}.profile.queryId: must equal case id`);
    }
    if (item.profile.normalizerVersion !== dataset.versions.normalizerVersion) {
      issues.push(`cases.${index}.profile.normalizerVersion: version mismatch`);
    }
    if (item.profile.parserVersion !== dataset.versions.parserVersion) {
      issues.push(`cases.${index}.profile.parserVersion: version mismatch`);
    }
    if (duplicates(item.knownRelationshipEmployeeIds).length) {
      issues.push(`cases.${index}.knownRelationshipEmployeeIds: duplicate employeeId`);
    }
    if (item.knownRelationshipEmployeeIds.some((id) => !employeeIds.has(id))) {
      issues.push(`cases.${index}.knownRelationshipEmployeeIds: unknown employeeId`);
    }
  });

  const prototype = dataset.prototypeValidation;
  if (prototype && prototype.successfulParticipantCount > prototype.participantCount) {
    issues.push("prototypeValidation: successful count exceeds participant count");
  }
  if (issues.length) throw new EvaluationDatasetValidationError(issues);
  return dataset;
}
