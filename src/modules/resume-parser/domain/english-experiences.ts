import { DATE_RANGE_PATTERN, parseDateRange } from "./dates";
import { normalizeSchool } from "./normalization";
import { isResumeSection } from "./resume-sections";

export interface InferredEnglishWork {
  company: string;
  title: string;
  dates: string;
  lineCount: number;
}

export interface InferredEnglishEducation {
  school: string;
  major: string | null;
  dates: string | null;
  lineCount: number;
}

const ROLE = /\b(?:intern|engineer|developer|scientist|researcher|fellow|postdoc(?:tor(?:al)?)?|instructor|(?:exchange\s+)?research\s+student|analyst|manager|director|consultant|designer|architect|specialist|coordinator|officer|accountant|recruiter|lecturer|professor|assistant|associate|technician|founder|president|head|lead|executive|liaison|advis[eo]r|CEO|CTO|CFO|COO|CHRO|VP|SVP)\b/iu;
const NARRATIVE = /^(?:\d{1,3}[.)、]\s*)?(?:responsible\b|responsibilities\b|achievements?\b|led\b|managed\b|developed\b|designed\b|built\b|implemented\b|supported\b|collaborated\b|conducted\b|worked\b|delivered\b|improved\b|achieved\b|published\b|awarded\b|propos(?:e|ed)\b|establish(?:ed)?\b|supervis(?:e|ed)\b|studied\b|invented\b|discovered\b|characteriz(?:ed|ation)\b|explored\b|focused\b|elucidated\b|investigated\b|identified\b|relevant coursework\b|courses?\b|gpa\b|grade\b|thesis\b|dissertation\b)/iu;
const FIELD = /^[\p{L}][\p{L} \t/]{0,30}[:：]/u;
const DEGREE_PATTERN = String.raw`\b(?:bachelor(?:['’]s)?(?:\s+of\s+(?:science|arts|engineering|business administration|education|fine arts))?|master(?:['’]s)?(?:\s+of\s+(?:science|arts|engineering|business administration|philosophy|education|fine arts))?|doctor(?:ate)?(?:\s+of\s+(?:philosophy|medicine|education))?|[BM]\.?\s?Sc\.?|[BM]\.?[ASE]\.?|[BM]\.?Eng\.?|MBA|M\.?Phil\.?|Ph\.?D\.?|DPhil|MD|LL[BM]|associate(?:['’]s)?\s+(?:degree|of\s+(?:science|arts|applied science))|diploma)(?=$|[^A-Za-z])`;
const DEGREE = new RegExp(DEGREE_PATTERN, "iu");
const MAJOR = /\b(?:science|engineering|technology|biotechnology|business|administration|management|economics|finance|accounting|marketing|law|medicine|medical|pharmacy|immunology|oncology|pharmacology|biology|neurobiology|microbiology|biochemistry|biomedical|infectious|disease|mathematics|statistics|physics|chemistry|psychology|history|philosophy|arts?|design|literature|linguistics|education|communications?|nursing|architecture)\b/iu;
const INSTITUTION = /\b(?:university|college|institute|school|academy|polytechnic)\b/iu;
const ORGANIZATION = /\b(?:university|college|institute|school|academy|polytechnic|department|hospital|cent(?:er|re)|inc|ltd|llc|corp(?:oration)?|company|laborator(?:y|ies))\b/iu;
const SCHOOL_ABBREVIATION = /^(?:MIT|UCL|UCLA|LSE|ETH Zurich|NUS|NTU)$/iu;
const EMPLOYMENT_TYPE = /^(?:full[ -]time|part[ -]time|contract|permanent|temporary|freelance|remote|hybrid|on[ -]site)(?:\s*[·,/]\s*(?:remote|hybrid|on[ -]site))?$/iu;
const DURATION = /^\(?\d+\s*(?:years?|yrs?|months?|mos?)(?:\s+\d+\s*(?:months?|mos?))?\)?$/iu;

export function hasEnglishEmploymentRole(value: string): boolean {
  return ROLE.test(value) && !DEGREE.test(value) && !NARRATIVE.test(value);
}

export function hasEnglishDegree(value: string): boolean {
  return DEGREE.test(value);
}

export function englishEducationMajor(value: string): string | null {
  if (/^(?:MBA\.?|Master(?:['’]s)?\s+of\s+Business Administration)$/iu.test(value.trim())) return "Business Administration";
  const program = DEGREE.test(value) ? value.replace(/\bfellowship\b/giu, "") : value;
  return program.replace(new RegExp(DEGREE_PATTERN, "giu"), "")
    .replace(/\bdegree\b/giu, "")
    .replace(/\(?\b(?:hons|honours?|honors?)\b\.?\)?/giu, "")
    .replace(/^[\s,;:()/-]*(?:in|of)\s+/iu, "")
    .replace(/^[\s,;:()/-]+|[\s,;:()/-]+$/gu, "") || null;
}

function cleanPart(value: string): string {
  return value.trim().replace(/^[,;:|·—–-]+\s*|\s*[,;:|·—–-]+$/gu, "");
}

function rangeIn(text: string): string | null {
  const ranges = text.match(new RegExp(DATE_RANGE_PATTERN, "giu")) ?? [];
  return ranges.length === 1 ? ranges[0] : null;
}

function contentParts(text: string, dates: string | null): string[] {
  const range = dates ? parseDateRange(dates) : null;
  return (dates ? text.replace(dates, "") : text)
    .split(/\n|\||｜|\t| {2,}|\s+[—–]\s+|\s+-\s+/u)
    .map(cleanPart).filter(part => Boolean(part) && !(/^\d{4}$/u.test(part) && (range?.start?.startsWith(part) || range?.end?.startsWith(part))));
}

function organizationName(value: string): string {
  return value.replace(/^Department\s+of\s+[^,]+,\s*/iu, "")
    .replace(/^[^,]*\bScholar\b[^,]*,\s*(?=.*\b(?:University|School|College)\b)/iu, "");
}

function workBlock(lines: string[], inWorkSection: boolean): Omit<InferredEnglishWork, "lineCount"> | null {
  // A degree-qualified fellowship can be a role when the author lists it as work.
  const isRole = (value: string) => hasEnglishEmploymentRole(value) ||
    (inWorkSection && (ROLE.test(value) || /\bfellowship\b/iu.test(value)) && !NARRATIVE.test(value));
  const text = lines.join("\n");
  const organizationDates = lines.filter(line => !isRole(line) && rangeIn(line));
  const dates = organizationDates.length === 1 ? rangeIn(organizationDates[0]) : rangeIn(text);
  if (!dates) return null;
  let parts = contentParts(text, dates).filter(part => !EMPLOYMENT_TYPE.test(part) && !DURATION.test(part));
  if (parts.length === 1) {
    const at = parts[0].match(/^(.+?)\s+(?:at|@)\s+(.+)$/iu);
    if (at && isRole(at[1])) parts = [at[1], at[2]];
    else {
      const commaParts = parts[0].split(/,\s*/u).map(cleanPart).filter(Boolean);
      const roleIndex = commaParts.findIndex(isRole);
      if (commaParts.length > 1 && roleIndex === 0) {
        const suffix = /^(?:Inc\.?|Ltd\.?|LLC|Corp\.?)$/iu.test(commaParts[2] ?? "") ? `, ${commaParts[2]}` : "";
        parts = [commaParts[0], commaParts[1] + suffix];
      } else if (roleIndex > 0) parts = [commaParts.slice(0, roleIndex).join(", "), commaParts[roleIndex]];
    }
  }
  const roles = parts.flatMap((part, index) => isRole(part) ? [index] : []);
  if (roles.length !== 1 || parts.length < 2) return null;
  const roleIndex = roles[0];
  const candidates = (roleIndex === 0 ? parts.slice(1) : parts.slice(0, roleIndex).reverse())
    .filter(part => !NARRATIVE.test(part));
  // Tables can place a discipline between the employer and the position.
  const employer = candidates.find(part => ORGANIZATION.test(part)) ?? candidates[0];
  if (!employer) return null;
  const company = organizationName(employer).replace(/\s*·\s*(?:full[ -]time|part[ -]time|contract|permanent|temporary|freelance)\b.*$/iu, "").trim();
  if (!/[\p{L}]/u.test(company) || NARRATIVE.test(company) || company.length > 160) return null;
  return { company, title: parts[roleIndex], dates };
}

export function inferEnglishWorkAt(lines: readonly string[], index: number, inWorkSection = false): InferredEnglishWork | null {
  const block: string[] = [];
  for (let offset = 0; offset < 4 && index + offset < lines.length; offset++) {
    const line = lines[index + offset];
    const role = line.match(/^(?:position|job title|title|role)\s*[:：]\s*(.+)$/iu);
    if (!line || isResumeSection(line) || (FIELD.test(line) && !role) || NARRATIVE.test(line)) break;
    block.push(role?.[1] ?? line);
    const inferred = workBlock(block, inWorkSection);
    if (inferred) return { ...inferred, lineCount: block.length };
  }
  return null;
}

function schoolPart(part: string): { school: string; rest: string } | null {
  const degree = part.match(DEGREE);
  let school = organizationName(cleanPart(degree?.index === undefined ? part : part.slice(0, degree.index)));
  let rest = degree?.index === undefined ? "" : part.slice(degree.index);
  const suffix = school.match(/^(.+?\b(?:University|College|Academy|Polytechnic|Institute(?: of Technology)?))\s+(.+)$/iu);
  if (suffix && !/^(?:of|at|and|in)\b/iu.test(suffix[2]) && MAJOR.test(suffix[2]) && !INSTITUTION.test(suffix[2])) {
    school = suffix[1];
    rest = `${suffix[2]} ${rest}`.trim();
  }
  if (!/^[A-Za-z]/u.test(school) || school.length > 160 || NARRATIVE.test(school) || hasEnglishEmploymentRole(school) || /\b(?:worked|responsible|project|collaborated|served|partnered)\b/iu.test(school)) return null;
  if (!INSTITUTION.test(school) && !SCHOOL_ABBREVIATION.test(school) && normalizeSchool(school).method !== "ALIAS") return null;
  return { school, rest };
}

function educationBlock(lines: string[]): Omit<InferredEnglishEducation, "lineCount"> | null {
  const text = lines.join("\n");
  if (hasEnglishEmploymentRole(text)) return null;
  const dates = rangeIn(text);
  if (!dates && new RegExp(DATE_RANGE_PATTERN, "iu").test(text)) return null;
  // Commas before a degree or major divide fields; commas in campus names stay intact.
  const parts = contentParts(text, dates).flatMap(part => part.split(/,\s*(?=(?:Bachelor|Master|Doctor|B\.?[AS]|M\.?[AS]|MBA|Ph\.?D|Computer|Software|Electrical|Mechanical|Civil|Chemical|Biomedical|Business|Economics|Finance|Law|Medicine|Biology|Chemistry|Physics|Mathematics|Psychology|History|English|Nursing|Education)\b)/iu)).map(cleanPart).filter(Boolean);
  const schools = parts.map(schoolPart);
  const schoolIndexes = schools.flatMap((school, index) => school ? [index] : []);
  if (schoolIndexes.length !== 1 || (!dates && !DEGREE.test(text))) return null;
  const schoolIndex = schoolIndexes[0];
  const institution = schools[schoolIndex]!;
  const programs = parts.flatMap((part, index) => {
    const value = index === schoolIndex ? institution.rest : part;
    const major = englishEducationMajor(value);
    return major ? [major] : [];
  });
  if (programs.some(program => !MAJOR.test(program) || program.length > 100)) return null;
  return { school: institution.school, major: programs.join(" ") || null, dates };
}

export function inferEnglishEducationAt(lines: readonly string[], index: number): InferredEnglishEducation | null {
  const block: string[] = [];
  let inferred: InferredEnglishEducation | null = null;
  for (let offset = 0; offset < 4 && index + offset < lines.length; offset++) {
    const line = lines[index + offset];
    const program = line.match(/^(?:major|field of study|degree|qualification|program(?:me)?|track)\s*[:：]\s*(.+)$/iu);
    if (!line || isResumeSection(line) || (FIELD.test(line) && !program) || NARRATIVE.test(line)) break;
    if (hasEnglishEmploymentRole(line)) return inferred?.major ? inferred : null;
    block.push(program?.[1] ?? line);
    const candidate = educationBlock(block);
    if (candidate) inferred = { ...candidate, lineCount: block.length };
  }
  return inferred;
}
