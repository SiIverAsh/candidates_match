import { DATE_RANGE_PATTERN } from "./dates";
import { hasEnglishEmploymentRole } from "./english-experiences";
import { isResumeSection } from "./resume-sections";

export interface InferredEducation {
  school: string;
  major: string | null;
  dates: string | null;
  lineCount: number;
}

// Role evidence takes precedence over the institution name: a university can be an employer.
export function hasEmploymentRole(value: string): boolean {
  return /实习生|实习助理|工程师|经理|讲师|教师|教授|研究助理|助教|行政助理/u.test(value) || hasEnglishEmploymentRole(value);
}

const DATE_RANGE = new RegExp(DATE_RANGE_PATTERN, "iu");
const DEGREE = /本科|学士|硕士(?:研究生)?|博士(?:研究生)?|大专|研究生|在读|\b(?:bachelor(?:'?s)?|master(?:'?s)?|ph\.?d\.?|b\.?sc\.?|m\.?sc\.?)\b/giu;
const MAJOR_SIGNAL = /科学|工程|技术|管理|经济|金融|营销|医学|药学|免疫|肿瘤|药理|药物|设计|语言|英语|中文|法学|物理|数学|历史|哲学|艺术|化学|生物|心理|建筑|护理|教育|传播|统计|\b(?:science|engineering|business|administration|economics|law|medicine|immunology|oncology|pharmacology|biology|biochemistry|mathematics|physics|chemistry|psychology|history|arts?)\b/iu;
const NARRATIVE = /负责|参与|合作|客户|项目|服务于|就职|任职|担任|授课|讲座|\b(?:worked|responsible|client|project|collaborated)\b/iu;

function schoolPrefix(value: string): { school: string; rest: string } | null {
  if (NARRATIVE.test(value)) return null;
  const chinese = value.match(/^([\p{Script=Han}A-Za-z·]+(?:大学|学院|高等专科学校|职业技术学校|中学))(.*)$/u);
  const english = value.match(/^([A-Za-z][A-Za-z .&'-]*?\b(?:University|College|Institute(?: of Technology)?))\b(.*)$/iu);
  const match = chinese ?? english;
  return match ? { school: match[1].trim(), rest: match[2].trim() } : null;
}

function inferBlock(lines: string[]): Omit<InferredEducation, "lineCount"> | null {
  const text = lines.join(" | ");
  if (hasEmploymentRole(text) || NARRATIVE.test(text)) return null;
  const ranges = text.match(new RegExp(DATE_RANGE.source, "giu")) ?? [];
  if (ranges.length > 1) return null;
  const dates = ranges[0] ?? null;
  const chunks = text.replace(DATE_RANGE, "").split(/[,，|｜\t]| {2,}/u).map((part) => part.trim()).filter(Boolean);
  const schools = chunks.map((chunk) => schoolPrefix(chunk));
  const schoolIndexes = schools.flatMap((school, index) => school ? [index] : []);
  if (schoolIndexes.length !== 1) return null;
  const index = schoolIndexes[0];
  const institution = schools[index]!;
  const rest = chunks.map((chunk, chunkIndex) => chunkIndex === index ? institution.rest : chunk);
  const hasDegree = rest.some((chunk) => Boolean(chunk.match(DEGREE)));
  if (!dates && !hasDegree) return null;
  const majorParts = rest.map((chunk) => chunk.replace(DEGREE, "").replace(/[（(]\s*[）)]/gu, "").trim()).filter(Boolean);
  // Unknown adjacent prose is not silently turned into a major.
  if (majorParts.some((part) => !MAJOR_SIGNAL.test(part) || part.length > 80)) return null;
  return { school: institution.school, major: majorParts.join(" ") || null, dates };
}

export function inferEducationAt(lines: string[], index: number): InferredEducation | null {
  const block: string[] = [];
  let inferred: InferredEducation | null = null;
  for (let offset = 0; offset < 4 && index + offset < lines.length; offset++) {
    const line = lines[index + offset];
    if (!line || isResumeSection(line) || /^[^:：]{1,24}[:：]/u.test(line)) break;
    if (inferred && hasEmploymentRole(line)) {
      if (!inferred.major && !DATE_RANGE.test(line) && !schoolPrefix(line)) return null;
      break;
    }
    block.push(line);
    const candidate = inferBlock(block);
    if (candidate) inferred = { ...candidate, lineCount: block.length };
  }
  return inferred;
}
