import { DATE_POINT_PATTERN, DATE_RANGE_PATTERN } from "./dates";
import { hasEnglishEmploymentRole } from "./english-experiences";
import { isResumeSection } from "./resume-sections";
import { withoutMentorAnnotations } from "./experience-text";

export interface InferredEducation {
  school: string;
  major: string | null;
  dates: string | null;
  lineCount: number;
}

// Role evidence takes precedence over the institution name: a university can be an employer.
export function hasEmploymentRole(value: string): boolean {
  const candidate = withoutMentorAnnotations(value);
  return /实习生|实习助理|工程师|经理|讲师|教师|教授|研究员|(?:研究|科研|教学|行政)助理|博士后|科学家|化学师|药剂师|医师|医生|技师|管理员|技术员|操作员|质检员|检验员|分析员|总工|顾问|总监|主管|专员|负责人|助教/u.test(candidate) || hasEnglishEmploymentRole(candidate);
}

const DATE_RANGE = new RegExp(DATE_RANGE_PATTERN, "iu");
const DEGREE = /(?:理学|理科|工学|工科|医学|文学|管理学|经济学)?(?:本科|学士|硕士(?:研究生)?|博士(?:研究生)?)(?:学位)?|大专|研究生|在读|\b(?:bachelor(?:'?s)?|master(?:'?s)?|ph\.?d\.?|b\.?sc\.?|m\.?sc\.?)\b/giu;
const MAJOR_SIGNAL = /科学|工程|技术|管理|经济|金融|营销|医学|药学|中药|水产|养殖|生态|有机|兽医|病理|发酵|免疫|肿瘤|药理|药物|药剂|制药|制剂|临床|遗传|病原|动物|植物|生命|计算机|自动化|机械|电气|通信|电子|材料|食品|农学|林学|设计|语言|英语|中文|法学|物理|数学|历史|哲学|艺术|化学|生物|心理|建筑|护理|教育|传播|统计|\b(?:science|engineering|business|administration|economics|law|medicine|immunology|oncology|pharmacology|biology|biochemistry|mathematics|physics|chemistry|psychology|history|arts?)\b/iu;
const NARRATIVE = /负责|参与|合作|客户|项目|服务于|就职|任职|担任|授课|讲座|\b(?:worked|responsible|client|project|collaborated)\b/iu;

function schoolPrefix(value: string): { school: string; rest: string } | null {
  if (NARRATIVE.test(value)) return null;
  const chinese = value.match(/^([\p{Script=Han}A-Za-z·]+?大学(?:[\p{Script=Han}]{1,12}分校)?)(.*)$/u)
    ?? value.match(/^([\p{Script=Han}A-Za-z·]+?(?:研究所|研究院))(.*)$/u)
    ?? value.match(/^([\p{Script=Han}A-Za-z·]+?(?:学院|高等专科学校|职业技术学校|中学))(.*)$/u);
  const english = value.match(/^([A-Za-z][A-Za-z .&'-]*?\b(?:University|College|Institute(?: of Technology)?))\b(.*)$/iu);
  const match = chinese ?? english;
  return match ? { school: match[1].trim(), rest: match[2].trim() } : null;
}

export function chineseEducationMajor(value: string): string | null {
  const program = withoutMentorAnnotations(value).split(/研究方向\s*[:：]/u)[0]
    .replace(/^[\p{Script=Han}]{1,16}学院\s*/u, "")
    .replace(DEGREE, "").replace(/全日制|统招/gu, "")
    .replace(/[（(]\s*(?:直博生|\d+(?:\.\d+)?%)?\s*[）)]/gu, "")
    .replace(/^[\s·|/]+|[\s·|/]+$/gu, "").trim();
  return program && program.length <= 100 && MAJOR_SIGNAL.test(program) && !NARRATIVE.test(program) ? program : null;
}

function inferBlock(lines: string[]): Omit<InferredEducation, "lineCount"> | null {
  const text = withoutMentorAnnotations(lines.join(" | ")).replace(/([医药理文工农法])[ \t]+学/gu, "$1学");
  if (hasEmploymentRole(text) || NARRATIVE.test(text)) return null;
  const ranges = text.match(new RegExp(DATE_RANGE.source, "giu")) ?? [];
  if (ranges.length > 1) return null;
  const dates = ranges[0] ?? text.match(new RegExp(`${DATE_POINT_PATTERN}\\s*[-—–‐‑‒−~～](?=\\s*(?:\\||$))`, "iu"))?.[0] ?? null;
  const chunks = (dates ? text.replace(dates, "") : text)
    .replace(/\b(?:985|211)\b|双一流高校|双一流|全日制|统招|[（(]直博生[）)]/gu, "")
    .replace(/[（(]\s*(?:\d+(?:\.\d+)?%|排名[^）)]*)\s*[）)]/gu, "")
    .replace(/[（(]\s*[）)]/gu, "")
    .split(/[,，|｜\t/]| {2,}/u).map((part) => part.trim()).filter(Boolean);
  const schools = chunks.map((chunk) => schoolPrefix(chunk));
  // A faculty in a university's education row is not a second institution.
  const firstSchool = schools.findIndex(Boolean);
  const facultyIndexes = schools.flatMap((school, index) => school && index > firstSchool && /大学|学院/u.test(schools[firstSchool]?.school ?? "") && /学院$|研究所$|研究院$/u.test(school.school) && lines.some(line => line.includes(schools[firstSchool]!.school) && line.includes(school.school)) ? [index] : []);
  const schoolIndexes = schools.flatMap((school, index) => school && !facultyIndexes.includes(index) ? [index] : []);
  if (schoolIndexes.length !== 1) return null;
  const index = schoolIndexes[0];
  const institution = schools[index]!;
  const rest = chunks.map((chunk, chunkIndex) => chunkIndex === index ? institution.rest : facultyIndexes.includes(chunkIndex) ? schools[chunkIndex]!.rest : chunk);
  const hasDegree = rest.some((chunk) => Boolean(chunk.match(DEGREE)));
  if (!dates && !hasDegree) return null;
  if (/研究所$|研究院$/u.test(institution.school) && !hasDegree) return null;
  const majorParts = rest.map((chunk) => chunk.replace(DEGREE, "").replace(/[（(]\s*[）)]/gu, "").replace(/^[/\\·\s]+|[/\\·\s]+$/gu, "").trim()).filter(Boolean);
  // Unknown adjacent prose is not silently turned into a major.
  if (majorParts.some((part) => !MAJOR_SIGNAL.test(part) || part.length > 80)) return null;
  const distinctMajors = [...new Set(majorParts)].filter(part => !majorParts.some(other => other !== part && other.replace(/[（(][^）)]*[）)]/gu, "").trim() === part));
  return { school: institution.school, major: distinctMajors.join(" ") || null, dates };
}

export function inferEducationAt(lines: string[], index: number): InferredEducation | null {
  const block: string[] = [];
  let inferred: InferredEducation | null = null;
  for (let offset = 0; offset < 4 && index + offset < lines.length; offset++) {
    const line = lines[index + offset];
    if (!line || isResumeSection(line) || /^[^:：]{1,24}[:：]/u.test(line)) break;
    if (offset && DATE_RANGE.test(line) && block.some(part => DATE_RANGE.test(part))) break;
    if (offset && DATE_RANGE.test(line) && !block.some(part => schoolPrefix(part.replace(DATE_RANGE, "").trim())) && schoolPrefix(line.replace(DATE_RANGE, "").trim())) break;
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
