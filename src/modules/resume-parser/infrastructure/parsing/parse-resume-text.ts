import { DATE_RANGE_PATTERN, parseDateRange } from "../../domain/dates";
import { hasEmploymentRole, inferEducationAt } from "../../domain/infer-education";
import type {
  CandidateEducationExperience,
  CandidateProfile,
  CandidateWorkExperience,
  ResumeSource,
} from "../../domain/models";
import {
  NORMALIZER_VERSION,
  normalizeCompany,
  normalizeFunction,
  normalizeMajor,
  normalizeSchool,
} from "../../domain/normalization";

export const PARSER_VERSION = "resume-heuristic-v6";

interface WorkDraft { company: string | null; title: string | null; dates: string | null }
interface EducationDraft { school: string | null; major: string | null; dates: string | null }
type Section = "work" | "education" | null;

const EMPTY_WORK = (): WorkDraft => ({ company: null, title: null, dates: null });
const EMPTY_EDUCATION = (): EducationDraft => ({ school: null, major: null, dates: null });

const COMPANY_LABEL = /^(?:公司|单位|雇主|实习公司|实习单位|company|employer)\s*[:：]/iu;
const EDUCATION_FIELD = /^(?:学位|学历|专业|主修|就读时间|教育时间|时间|日期|degree|qualification|major|field of study|period|date)\s*[:：]/iu;
const INSTITUTION = /大学|学院|学校|中学|\b(?:university|college|institute|school|academy|polytechnic)\b/iu;
const SECTION_HEADING = /^(?:工作经历|工作经验|职业经历|实习经历|教育经历|教育背景|学历|work experience|employment|education)\s*[:：]?\s*$/iu;
const NARRATIVE_HEADING = /^(?:负责|参与|发表|完成|获得|published\b|led\b|conducted\b|developed\b|worked\b)/iu;
const FIELD_LABEL = /^(?:姓名|候选人|公司|单位|雇主|实习公司|实习单位|职位|职务|岗位|实习职位|实习岗位|学校|院校|大学|专业|主修|任职时间|工作时间|实习时间|实习日期|就读时间|教育时间|时间|日期|name|candidate name|company|employer|title|position|role|school|university|college|major|field of study|period|date)\s*[:：]/iu;

function resumeLines(text: string): string[] {
  return text.split(/\r?\n/gu).flatMap((line) => {
    // A semicolon separates labelled fields, but can also be part of a title,
    // company or major. Keep it unless another explicit field follows.
    const parts = line.split(/([;；])/u);
    const lines: string[] = [];
    let current = parts[0];
    for (let index = 1; index < parts.length; index += 2) {
      const rest = parts[index + 1];
      if (FIELD_LABEL.test(rest.trimStart()) || SECTION_HEADING.test(rest.trim())) {
        lines.push(current);
        current = rest;
      } else current += parts[index] + rest;
    }
    lines.push(current);
    return lines.map(cleanLine);
  });
}

function valueAfterLabel(line: string, labels: string): string | null {
  const match = line.match(new RegExp(`^(?:${labels})\\s*[:：]\\s*(.+)$`, "iu"));
  return match?.[1]?.trim() || null;
}

function hasValue(draft: WorkDraft | EducationDraft): boolean {
  return Object.values(draft).some(Boolean);
}

function compactParts(line: string): string[] {
  return line.split(/\s*(?:\||｜|\t| {2,})\s*/u).map((part) => part.trim()).filter(Boolean);
}

function looksLikeDateRange(value: string): boolean {
  return new RegExp(DATE_RANGE_PATTERN, "iu").test(value);
}

function cleanLine(line: string): string {
  return line.trim().replace(/^[•●▪◦·*-]+\s*/u, "");
}

function workExperience(draft: WorkDraft, sequence: number): CandidateWorkExperience {
  return {
    sequence,
    company: normalizeCompany(draft.company),
    rawTitle: draft.title,
    normalizedFunction: normalizeFunction(draft.title),
    dates: parseDateRange(draft.dates),
  };
}

function educationExperience(
  draft: EducationDraft,
  sequence: number,
): CandidateEducationExperience {
  return {
    sequence,
    school: normalizeSchool(draft.school),
    major: normalizeMajor(draft.major),
    dates: parseDateRange(draft.dates),
  };
}

export function parseResumeText(
  source: ResumeSource,
  text: string,
  parsedAt: string,
): CandidateProfile {
  let candidateName: string | null = null;
  let section: Section = null;
  let currentWork = EMPTY_WORK();
  let currentEducation = EMPTY_EDUCATION();
  const workDrafts: WorkDraft[] = [];
  const educationDrafts: EducationDraft[] = [];

  const flushWork = () => {
    if (hasValue(currentWork)) workDrafts.push(currentWork);
    currentWork = EMPTY_WORK();
  };
  const flushEducation = () => {
    if (hasValue(currentEducation)) educationDrafts.push(currentEducation);
    currentEducation = EMPTY_EDUCATION();
  };

  const sourceLines = resumeLines(text);
  for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex++) {
    let line = sourceLines[lineIndex];
    if (!line) continue;

    const name = valueAfterLabel(line, "姓名|候选人|name|candidate name");
    if (name) { candidateName = name; continue; }

    const workSection = line.match(/^(?:工作(?:与|及|和|\/|／)实习经历|工作经历|工作经验|职业经历|实习经历|实习经验|实习实践|实习|employment|work experience|professional experience|internship experience|internships?)(?=\s|[:：]|$|(?:19|20)\d{2})\s*[:：]?\s*(.*)$/iu);
    if (workSection) {
      flushEducation();
      if (section === "work") flushWork();
      section = "work";
      line = workSection[1]?.trim() ?? "";
      if (!line) 
        continue;
    }
    const educationSection = line.match(/^(?:教育经历|教育背景|学历|education)\s*[:：]?\s*(.*)$/iu);
    if (educationSection) {
      flushWork();
      if (section === "education") flushEducation();
      section = "education";
      line = educationSection[1]?.trim() ?? "";
      if (!line) 
        continue;
    }

    const numbered = line.match(/^(?:\d{1,3}[.．、)]|[（(]\d{1,3}[）)])[ \t]*(\S.*)$/u);
    if (numbered) {
      const heading = numbered[1];
      const nextLine = sourceLines.slice(lineIndex + 1, lineIndex + 5).find((next) => next.length > 0) ?? "";
      if (section === "work" && COMPANY_LABEL.test(nextLine) && !FIELD_LABEL.test(heading)) {
        flushWork();
        currentWork.title = heading;
        continue;
      }
      if (section === "education" && !FIELD_LABEL.test(heading) &&
          (EDUCATION_FIELD.test(nextLine) || (INSTITUTION.test(heading) && !NARRATIVE_HEADING.test(heading)))) {
        flushEducation();
        currentEducation.school = heading;
        continue;
      }
      // Numbered labelled records and date-first rows still use the same field
      // parser as unnumbered resumes.
      if (FIELD_LABEL.test(heading) || looksLikeDateRange(heading)) line = heading;
    }

    const inferredEducation = inferEducationAt([line, ...sourceLines.slice(lineIndex + 1, lineIndex + 4)], 0);
    if (inferredEducation) {
      flushWork();
      flushEducation();
      section = "education";
      currentEducation = { school: inferredEducation.school, major: inferredEducation.major, dates: inferredEducation.dates };
      lineIndex += inferredEducation.lineCount - 1;
      continue;
    }

    const parts = compactParts(line);
    if (parts.length >= 3 && looksLikeDateRange(parts[0])) {
      // Explicit internship roles are employment even if a section heading was lost.
      if (hasEmploymentRole(parts.slice(2).join(" "))) {
        flushEducation();
        section = "work";
      }
      if (section === "work") {
        flushWork();
        currentWork = { dates: parts[0], company: parts[1], title: parts.slice(2).join(" ") };
      } else if (section === "education") {
        flushEducation();
        currentEducation = { dates: parts[0], school: parts[1], major: parts.slice(2).join(" ") };
      }
      continue;
    }

    const company = valueAfterLabel(line, "公司|单位|雇主|实习公司|实习单位|company|employer");
    if (company) {
      if (currentWork.company) flushWork();
      flushEducation();
      section = "work";
      currentWork.company = company;
      continue;
    }
    const title = valueAfterLabel(line, "职位|职务|岗位|实习职位|实习岗位|title|position|role");
    if (title) { section = "work"; currentWork.title = title; continue; }
    const school = valueAfterLabel(line, "学校|院校|大学|school|university|college");
    if (school) {
      if (currentEducation.school) flushEducation();
      flushWork();
      section = "education";
      currentEducation.school = school;
      continue;
    }
    const major = valueAfterLabel(line, "专业|主修|major|field of study");
    if (major) { section = "education"; currentEducation.major = major; continue; }
    const dates = valueAfterLabel(
      line,
      section === "education"
        ? "就读时间|教育时间|时间|日期|period|date"
        : "任职时间|工作时间|实习时间|实习日期|时间|日期|period|date",
    );
    if (dates) {
      if (section === "education") currentEducation.dates = dates;
      else { section = "work"; currentWork.dates = dates; }
    }
  }
  flushWork();
  flushEducation();

  const workExperiences = workDrafts.map(workExperience);
  const educations = educationDrafts.map(educationExperience);
  const hasWorkExperience = workExperiences.some((item) => Boolean(item.company.raw));
  const hasEducation = educations.some((item) => Boolean(item.school.raw));
  const hasIncompleteWorkFields = workExperiences.some(
    (item) => !item.company.raw || !item.rawTitle,
  );
  const hasIncompleteEducationFields = educations.some(
    (item) => !item.school.raw || !item.major.raw,
  );
  const allExperiences = [...workExperiences, ...educations];
  const hasMissingDates = allExperiences.some(
    (item) => !item.dates.start || (!item.dates.end && !item.dates.current),
  );
  const completeness = {
    hasName: Boolean(candidateName),
    hasWorkExperience,
    hasEducation,
    hasIncompleteWorkFields,
    hasIncompleteEducationFields,
    hasMissingDates,
  };
  const warnings: string[] = [];
  if (!hasWorkExperience) warnings.push("未识别到包含公司的工作经历。");
  if (!hasEducation) warnings.push("未识别到包含学校的教育经历。");
  if (hasIncompleteWorkFields) warnings.push("部分工作经历缺少公司或职位。");
  if (hasIncompleteEducationFields) warnings.push("部分教育经历缺少学校或专业。");
  if (hasMissingDates) warnings.push("部分经历缺少可识别的起止时间，后续时间重叠判断可能不完整。");

  const parseStatus = !hasWorkExperience && !hasEducation
    ? "INSUFFICIENT"
    : hasWorkExperience && hasEducation && !hasIncompleteWorkFields &&
        !hasIncompleteEducationFields && !hasMissingDates
      ? "COMPLETE"
      : "PARTIAL";

  return {
    queryId: source.queryId,
    sourceType: source.sourceType,
    sourceFormat: source.sourceFormat,
    candidateName,
    parseStatus,
    completeness,
    warnings,
    workExperiences,
    educations,
    parserVersion: PARSER_VERSION,
    normalizerVersion: NORMALIZER_VERSION,
    parsedAt,
    expiresAt: source.expiresAt,
  };
}

export function failedCandidateProfile(
  source: ResumeSource,
  parsedAt: string,
  warning: string,
): CandidateProfile {
  return {
    queryId: source.queryId,
    sourceType: source.sourceType,
    sourceFormat: source.sourceFormat,
    candidateName: null,
    parseStatus: "FAILED",
    completeness: {
      hasName: false,
      hasWorkExperience: false,
      hasEducation: false,
      hasIncompleteWorkFields: false,
      hasIncompleteEducationFields: false,
      hasMissingDates: false,
    },
    warnings: [warning],
    workExperiences: [],
    educations: [],
    parserVersion: PARSER_VERSION,
    normalizerVersion: NORMALIZER_VERSION,
    parsedAt,
    expiresAt: source.expiresAt,
  };
}
