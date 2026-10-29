import { DATE_RANGE_PATTERN } from "./dates";
import { hasEmploymentRole } from "./infer-education";
import { isResumeSection } from "./resume-sections";
import { withoutMentorAnnotations } from "./experience-text";

export interface InferredLayoutWork {
  company: string;
  title: string | null;
  dates: string;
  lineCount: number;
}

const RANGE = new RegExp(DATE_RANGE_PATTERN, "iu");
const COMPANY_END = String.raw`(?:公司|集团|药业|医药|制药|科技|药厂|工厂|研究所|研究院|医院|大学(?:[\p{Script=Han}]{1,12}分校)?|学院|实验室|事务所|生物技术|事业部(?:[ A-Za-z\p{Script=Han}]{1,30})?中心)`;
const COMPANY = new RegExp(`^.{2,120}${COMPANY_END}(?:[（(][^）)]{1,30}[）)])?$`, "u");
const NARRATIVE = /^(?:\d+[.、)]\s*)?(?:负责|参与|完成|协助|主要|进行|从事|开展|承担|建立|开发|设计|利用|通过|根据|熟悉|掌握|任职|担任|工作内容|工作职责|项目|职责|成果|汇报对象|下属人数|薪酬|所在部门|公司规模|公司性质|所属行业)/u;
const DURATION = /^[（(]?\s*\d+\s*(?:年|个月|月)(?:\s*\d+\s*(?:个月|月))?\s*[）)]?$/u;

function cleanPart(value: string): string {
  return value.trim().replace(/\s*[（(]\s*\d+\s*(?:年|个月|月)(?:\s*\d+\s*(?:个月|月))?\s*[）)]\s*$/u, "")
    .replace(/^[,，;；|｜/·—–-]+\s*|\s*[,，;；|｜/·—–-]+$/gu, "");
}

function isCompany(value: string): boolean {
  return /\p{Script=Han}/u.test(value) && COMPANY.test(value) && !NARRATIVE.test(value) && !/[。；;:：]/u.test(value);
}

function isRole(value: string): boolean {
  return value.length <= 100 && hasEmploymentRole(value) && !NARRATIVE.test(value) && !isCompany(value) && !/[。；;:：]/u.test(value)
    && !/^\d+[.、)]/u.test(value) && !/汇报|工作事宜|工作内容|负责|参与|完成|熟悉|掌握|定时|根据|保证|确保/u.test(value);
}

function parseBlock(lines: string[], inWorkSection: boolean): Omit<InferredLayoutWork, "lineCount"> | null {
  const text = withoutMentorAnnotations(lines.join("\n")).replace(/[,，]\s*服务客户(?:单位)?\s*[:：]?.*$/u, "");
  const ranges = text.match(new RegExp(DATE_RANGE_PATTERN, "giu")) ?? [];
  if (ranges.length !== 1) return null;
  const dates = ranges[0];
  const parts = text.replace(dates, "").split(/\n|\t|\||｜|[,，]| {2,}|\s+\/\s+/u).map(cleanPart).filter(part => part && !DURATION.test(part));
  // Some PDF generators separate the company and position with a single space.
  const fields = parts.flatMap(part => {
    const row = part.match(new RegExp(`^(.+?${COMPANY_END}(?:[（(][^）)]{1,30}[）)])?)[ \\t]+(.+)$`, "u"));
    return row && isCompany(row[1]) && isRole(row[2]) ? [row[1], row[2]] : [part];
  });
  const companies = fields.filter(isCompany);
  const titles = fields.filter(isRole);
  if (!companies.length || titles.length > 1 || (!inWorkSection && titles.length !== 1)) return null;
  if (companies.length > 1 && (!titles.length || companies.slice(1).some(part => !/学院$|实验室$/u.test(part)))) return null;
  // Extra text must not be silently folded into a role or employer.
  const extras = fields.filter(part => !companies.includes(part) && part !== titles[0] && !/^[\p{Script=Han}]{1,20}学院$/u.test(part));
  // A role followed by a discipline (博士后 | 药剂学) retains that source qualifier.
  if (extras.some(part => !titles.length || !/^[\p{Script=Han}]{2,16}(?:学|工程|技术)$/u.test(part))) return null;
  return { company: companies[0], title: titles.length ? [titles[0], ...extras].join(" | ") : null, dates };
}

/** Date-anchored Chinese headers, including company/date followed by a separate title. */
export function inferLayoutWorkAt(lines: readonly string[], index: number, inWorkSection: boolean): InferredLayoutWork | null {
  const block: string[] = [];
  let inferred: InferredLayoutWork | null = null;
  for (let offset = 0; offset < 4 && index + offset < lines.length; offset++) {
    const line = lines[index + offset];
    if (!line || isResumeSection(line) || NARRATIVE.test(line) || /^[^:：]{1,24}[:：]/u.test(line)) break;
    if (inferred && RANGE.test(line)) break;
    block.push(line);
    const candidate = parseBlock(block, inWorkSection);
    if (candidate) {
      inferred = { ...candidate, lineCount: block.length };
      if (candidate.title) return inferred;
    } else if (inferred) break;
  }
  return inferred;
}
