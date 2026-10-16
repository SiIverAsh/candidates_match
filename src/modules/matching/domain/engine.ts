import type {
  CandidateEducationExperience,
  CandidateWorkExperience,
  DatePrecision,
  ExperienceDateRange,
} from "../../resume-parser";
import {
  NORMALIZER_VERSION,
  normalizeCompany,
  normalizeFunction,
  normalizeMajor,
  normalizeSchool,
} from "../../resume-parser";
import type {
  EmployeeEducationSnapshot,
  EmployeeSnapshot,
  EmployeeWorkSnapshot,
  MatchingContext,
} from "../application/ports";
import { MATCHING_CONFIG } from "./config";
import type {
  EmployeeMatchResult,
  EvidenceOverlap,
  MatchConfidence,
  MatchEvidence,
  MatchRun,
} from "./models";

interface ComparableInterval {
  start: string;
  end: string;
  precision: Exclude<DatePrecision, "UNKNOWN">;
}

function precisionRank(value: DatePrecision): number {
  return value === "DAY" ? 3 : value === "MONTH" ? 2 : value === "YEAR" ? 1 : 0;
}

function coarsePrecision(
  left: DatePrecision,
  right: DatePrecision,
): Exclude<DatePrecision, "UNKNOWN"> | null {
  const rank = Math.min(precisionRank(left), precisionRank(right));
  return rank === 3 ? "DAY" : rank === 2 ? "MONTH" : rank === 1 ? "YEAR" : null;
}

function startBoundary(value: string, precision: DatePrecision): string | null {
  if (precision === "DAY") return value;
  if (precision === "MONTH") return `${value}-01`;
  if (precision === "YEAR") return `${value}-01-01`;
  return null;
}

function endBoundary(value: string, precision: DatePrecision): string | null {
  if (precision === "DAY") return value;
  if (precision === "YEAR") return `${value}-12-31`;
  if (precision === "MONTH") {
    const [year, month] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  }
  return null;
}

function candidateInterval(
  dates: ExperienceDateRange,
  referenceDate: string,
): ComparableInterval | null {
  if (!dates.start) return null;
  const start = startBoundary(dates.start, dates.startPrecision);
  const end = dates.current
    ? referenceDate
    : dates.end
      ? endBoundary(dates.end, dates.endPrecision)
      : null;
  const precision = dates.current
    ? dates.startPrecision === "UNKNOWN" ? null : dates.startPrecision
    : coarsePrecision(dates.startPrecision, dates.endPrecision);
  return start && end && precision ? { start, end, precision } : null;
}

function employeeInterval(
  startDate: string,
  endDate: string | null,
  referenceDate: string,
): ComparableInterval {
  return { start: startDate, end: endDate ?? referenceDate, precision: "DAY" };
}

function displayBoundary(value: string, precision: EvidenceOverlap["precision"]): string {
  return precision === "YEAR" ? value.slice(0, 4) : precision === "MONTH" ? value.slice(0, 7) : value;
}

function overlap(
  candidate: ExperienceDateRange,
  employeeStart: string,
  employeeEnd: string | null,
  referenceDate: string,
): EvidenceOverlap | null {
  const left = candidateInterval(candidate, referenceDate);
  if (!left) return null;
  const right = employeeInterval(employeeStart, employeeEnd, referenceDate);
  const start = left.start > right.start ? left.start : right.start;
  const end = left.end < right.end ? left.end : right.end;
  if (start > end) return null;
  const precision = coarsePrecision(left.precision, right.precision);
  if (!precision) return null;
  const months = precision === "YEAR"
    ? null
    : Math.max(0, Math.floor(
        (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
        (30.4375 * 24 * 60 * 60 * 1000),
      ));
  return {
    start: displayBoundary(start, precision),
    end: displayBoundary(end, precision),
    precision,
    months,
  };
}

function periodText(value: EvidenceOverlap): string {
  const precisionNote = value.precision === "YEAR" ? "；原始资料仅提供年份精度" : "";
  const duration = value.months !== null ? `，确认重叠约 ${value.months} 个月` : "";
  return `${value.start}–${value.end}${duration}${precisionNote}`;
}

function evidenceId(parts: Array<string | number>): string {
  return parts.join(":");
}

function comparisonKey(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[\s.,，。·'’"“”()（）_-]/gu, "");
}

function sameNormalized(left: string | null, right: string | null): boolean {
  return Boolean(left && right && comparisonKey(left) === comparisonKey(right));
}

function workEvidence(
  candidate: CandidateWorkExperience,
  employee: EmployeeWorkSnapshot,
  referenceDate: string,
): MatchEvidence | null {
  const candidateCompany = candidate.company.value;
  const employeeCompany = normalizeCompany(employee.company);
  if (!candidateCompany || !sameNormalized(candidateCompany, employeeCompany.value)) return null;
  const sharedTime = overlap(candidate.dates, employee.startDate, employee.endDate, referenceDate);
  const employeeFunction = normalizeFunction(employee.title);
  const sameFunction = Boolean(
    candidate.normalizedFunction.value &&
    employeeFunction.value &&
    candidate.normalizedFunction.value === employeeFunction.value,
  );
  if (sharedTime && sameFunction) {
    return {
      id: evidenceId(["work-function", candidate.sequence, employee.sequence]),
      type: "WORK_COMPANY_FUNCTION_OVERLAP",
      strength: "MEDIUM",
      score: MATCHING_CONFIG.weights.workCompanyFunctionOverlap,
      candidateSourceFields: [
        `workExperiences[${candidate.sequence}].company.raw`,
        `workExperiences[${candidate.sequence}].rawTitle`,
        `workExperiences[${candidate.sequence}].dates.raw`,
      ],
      employeeSourceFields: [
        `work_experiences[${employee.sequence}].company`,
        `work_experiences[${employee.sequence}].title`,
        `work_experiences[${employee.sequence}].start_date`,
        `work_experiences[${employee.sequence}].end_date`,
      ],
      normalizedValues: {
        company: candidateCompany,
        function: candidate.normalizedFunction.value!,
      },
      overlap: sharedTime,
      reason: `两人曾在 ${candidateCompany} 任职，${periodText(sharedTime)}，职位职能相近。`,
    };
  }
  if (sharedTime) {
    return {
      id: evidenceId(["work-overlap", candidate.sequence, employee.sequence]),
      type: "WORK_COMPANY_OVERLAP",
      strength: "WEAK",
      score: MATCHING_CONFIG.weights.workCompanyOverlap,
      candidateSourceFields: [
        `workExperiences[${candidate.sequence}].company.raw`,
        `workExperiences[${candidate.sequence}].dates.raw`,
      ],
      employeeSourceFields: [
        `work_experiences[${employee.sequence}].company`,
        `work_experiences[${employee.sequence}].start_date`,
        `work_experiences[${employee.sequence}].end_date`,
      ],
      normalizedValues: { company: candidateCompany },
      overlap: sharedTime,
      reason: `两人曾在 ${candidateCompany} 任职，${periodText(sharedTime)}。`,
    };
  }
  return {
    id: evidenceId(["work-company", candidate.sequence, employee.sequence]),
    type: "WORK_SAME_COMPANY",
    strength: "WEAK",
    score: MATCHING_CONFIG.weights.workSameCompany,
    candidateSourceFields: [`workExperiences[${candidate.sequence}].company.raw`],
    employeeSourceFields: [`work_experiences[${employee.sequence}].company`],
    normalizedValues: { company: candidateCompany },
    overlap: null,
    reason: `两人资料中均出现 ${candidateCompany}，但没有可确认的时间重叠。`,
  };
}

function educationEvidence(
  candidate: CandidateEducationExperience,
  employee: EmployeeEducationSnapshot,
  referenceDate: string,
): MatchEvidence | null {
  const candidateSchool = candidate.school.value;
  const employeeSchool = normalizeSchool(employee.school);
  if (!candidateSchool || !sameNormalized(candidateSchool, employeeSchool.value)) return null;
  const candidateMajor = candidate.major.value;
  const employeeMajor = normalizeMajor(employee.major);
  const sameMajor = sameNormalized(candidateMajor, employeeMajor.value);
  const sharedTime = overlap(candidate.dates, employee.startDate, employee.endDate, referenceDate);
  if (sharedTime && sameMajor) {
    return {
      id: evidenceId(["education-major", candidate.sequence, employee.sequence]),
      type: "EDUCATION_SCHOOL_MAJOR_OVERLAP",
      strength: "STRONG",
      score: MATCHING_CONFIG.weights.educationSchoolMajorOverlap,
      candidateSourceFields: [
        `educations[${candidate.sequence}].school.raw`,
        `educations[${candidate.sequence}].major.raw`,
        `educations[${candidate.sequence}].dates.raw`,
      ],
      employeeSourceFields: [
        `education_experiences[${employee.sequence}].school`,
        `education_experiences[${employee.sequence}].major`,
        `education_experiences[${employee.sequence}].start_date`,
        `education_experiences[${employee.sequence}].end_date`,
      ],
      normalizedValues: { school: candidateSchool, major: candidateMajor! },
      overlap: sharedTime,
      reason: `两人均就读于 ${candidateSchool}，${periodText(sharedTime)}，专业相同。`,
    };
  }
  if (sharedTime) {
    return {
      id: evidenceId(["education-overlap", candidate.sequence, employee.sequence]),
      type: "EDUCATION_SCHOOL_OVERLAP",
      strength: "MEDIUM",
      score: MATCHING_CONFIG.weights.educationSchoolOverlap,
      candidateSourceFields: [
        `educations[${candidate.sequence}].school.raw`,
        `educations[${candidate.sequence}].dates.raw`,
      ],
      employeeSourceFields: [
        `education_experiences[${employee.sequence}].school`,
        `education_experiences[${employee.sequence}].start_date`,
        `education_experiences[${employee.sequence}].end_date`,
      ],
      normalizedValues: { school: candidateSchool },
      overlap: sharedTime,
      reason: `两人均就读于 ${candidateSchool}，${periodText(sharedTime)}。`,
    };
  }
  return {
    id: evidenceId(["education-school", candidate.sequence, employee.sequence]),
    type: "EDUCATION_SAME_SCHOOL",
    strength: "WEAK",
    score: MATCHING_CONFIG.weights.educationSameSchool,
    candidateSourceFields: [`educations[${candidate.sequence}].school.raw`],
    employeeSourceFields: [`education_experiences[${employee.sequence}].school`],
    normalizedValues: { school: candidateSchool },
    overlap: null,
    reason: `两人资料中均出现 ${candidateSchool}，但没有可确认的就读时间重叠。`,
  };
}

function confidence(score: number, evidence: MatchEvidence[]): MatchConfidence {
  const hasStrongGate = evidence.some((item) => item.type === "EDUCATION_SCHOOL_MAJOR_OVERLAP");
  if (score >= MATCHING_CONFIG.thresholds.high && hasStrongGate) return "HIGH";
  if (score >= MATCHING_CONFIG.thresholds.medium) return "MEDIUM";
  return "LOW";
}

function deduplicateEvidence(items: MatchEvidence[]): MatchEvidence[] {
  const unique = new Map<string, MatchEvidence>();
  for (const item of items) {
    const signature = JSON.stringify({
      type: item.type,
      normalizedValues: item.normalizedValues,
      overlap: item.overlap,
    });
    if (!unique.has(signature)) unique.set(signature, item);
  }
  return [...unique.values()];
}

function matchEmployee(
  context: MatchingContext,
  employee: EmployeeSnapshot,
): Omit<EmployeeMatchResult, "rank"> | null {
  const evidence: MatchEvidence[] = [];
  for (const candidateWork of context.profile.workExperiences) {
    for (const employeeWork of employee.workExperiences) {
      const item = workEvidence(candidateWork, employeeWork, context.submittedAt.slice(0, 10));
      if (item) evidence.push(item);
    }
  }
  for (const candidateEducation of context.profile.educations) {
    for (const employeeEducation of employee.educations) {
      const item = educationEvidence(
        candidateEducation,
        employeeEducation,
        context.submittedAt.slice(0, 10),
      );
      if (item) evidence.push(item);
    }
  }
  const uniqueEvidence = deduplicateEvidence(evidence);
  if (uniqueEvidence.length === 0) return null;
  uniqueEvidence.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
  const score = Math.min(100, uniqueEvidence.reduce((total, item) => total + item.score, 0));
  return {
    employeeId: employee.employeeId,
    name: employee.name,
    email: employee.email,
    currentDepartment: employee.currentDepartment,
    currentTitle: employee.currentTitle,
    score,
    confidence: confidence(score, uniqueEvidence),
    evidence: uniqueEvidence,
  };
}

export function runMatchingEngine(
  context: MatchingContext,
  runId: string,
  createdAt: string,
): MatchRun {
  if (!context.employeeVersionId) throw new Error("EMPLOYEE_VERSION_REQUIRED");
  if (context.profile.parseStatus !== "COMPLETE" && context.profile.parseStatus !== "PARTIAL") {
    return {
      id: runId,
      queryId: context.queryId,
      employeeVersionId: context.employeeVersionId,
      status: "SKIPPED_INSUFFICIENT",
      resultCount: 0,
      results: [],
      ruleVersion: MATCHING_CONFIG.ruleVersion,
      thresholdVersion: MATCHING_CONFIG.thresholdVersion,
      normalizerVersion: NORMALIZER_VERSION,
      submittedAt: context.submittedAt,
      createdAt,
      expiresAt: context.expiresAt,
    };
  }
  const matched = context.employees
    .map((employee) => matchEmployee(context, employee))
    .filter((item): item is Omit<EmployeeMatchResult, "rank"> => Boolean(item))
    .sort((left, right) =>
      right.score - left.score ||
      right.evidence[0].score - left.evidence[0].score ||
      left.employeeId.localeCompare(right.employeeId),
    );
  const results = matched.map((item, index) => ({ ...item, rank: index + 1 }));
  return {
    id: runId,
    queryId: context.queryId,
    employeeVersionId: context.employeeVersionId,
    status: results.length ? "COMPLETED" : "NO_RESULTS",
    resultCount: results.length,
    results,
    ruleVersion: MATCHING_CONFIG.ruleVersion,
    thresholdVersion: MATCHING_CONFIG.thresholdVersion,
    normalizerVersion: NORMALIZER_VERSION,
    submittedAt: context.submittedAt,
    createdAt,
    expiresAt: context.expiresAt,
  };
}
