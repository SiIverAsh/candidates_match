import { DATE_RANGE_PATTERN, parseDateRange } from "./dates";
import { normalizeSchool } from "./normalization";
import { isResumeSection } from "./resume-sections";
import { withoutMentorAnnotations } from "./experience-text";

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

const ROLE = /\b(?:intern|engineer|developer|scientist|researcher|investigator|fellow|postdoc(?:tor(?:al)?)?|instructor|(?:exchange\s+)?research\s+student|analyst|manager|director|consultant|designer|architect|specialist|coordinator|officer|accountant|recruiter|lecturer|professor|assistant|associate|technician|founder|president|head|lead|executive|liaison|advis[eo]r|CEO|CTO|CFO|COO|CHRO|VP|SVP)\b/iu;
const NARRATIVE = /^(?:\d{1,3}[.)、]\s*)?(?:responsible\b|responsibilities\b|achievements?\b|led\b|managed\b|developed\b|designed\b|built\b|implemented\b|supported\b|collaborated\b|conducted\b|worked\b|delivered\b|improved\b|achieved\b|published\b|awarded\b|propos(?:e|ed)\b|establish(?:ed)?\b|supervis(?:e|ed)\b|studied\b|invented\b|discovered\b|characteriz(?:ed|ation)\b|explored\b|focused\b|elucidated\b|investigated\b|identified\b|serve\s+as\b|lead\s+(?:global|cross|the|a|an|development|research projects?)\b|advance\b|authored?\b|chair\b|mentor\b|reviewed?\b|represent(?:ed)?\b|customized?\b|(?:as|in)\s+20\d{2}\b|relevant coursework\b|courses?\b|gpa\b|grade\b|thesis\b|dissertation\b)/iu;
const FIELD = /^[\p{L}][\p{L} \t/]{0,30}[:：]/u;
const DEGREE_PATTERN = String.raw`\b(?:bachelor(?:['’]s)?(?:\s+of\s+(?:science|arts|engineering|business administration|education|fine arts))?|master(?:['’]s)?(?:\s+of\s+(?:science|arts|engineering|business administration|philosophy|education|fine arts))?|doctor(?:ate)?(?:\s+of\s+(?:philosophy|medicine|education))?|[BM]\.?\s?Sc\.?|[BM]\.?[ASE]\.?|[BM]\.?Eng\.?|MBA|M\.?Phil\.?|Ph\.?\s?D\.?|DPhil|MD|LL[BM]|associate(?:['’]s)?\s+(?:degree|of\s+(?:science|arts|applied science))|diploma)(?=$|[^A-Za-z])`;
const DEGREE = new RegExp(DEGREE_PATTERN, "iu");
const MAJOR = /\b(?:sciences?|engineering|technology|biotechnology|business|administration|management|economics|finance|accounting|marketing|law|medicine|medical|pharmacy|biopharmacy|immunology|oncology|pharmacology|pathology|neurotology|toxicology|genetics|biology|biological|neurobiology|microbiology|biochemistry|biomedical|infectious|disease|mathematics|statistics|physics|chemistry|psychology|history|philosophy|arts?|design|literature|linguistics|education|communications?|nursing|architecture)\b/iu;
const INSTITUTION = /\b(?:university|univ\.?|college|institute|school|academy|polytechnic)\b/iu;
const ORGANIZATION = /\b(?:university|college|institute|school|academy|polytechnic|department|hospital|cent(?:er|re)|inc|ltd|llc|corp(?:oration)?|company|laborator(?:y|ies))\b/iu;
const SCHOOL_ABBREVIATION = /^(?:MIT|UCL|UCLA|LSE|ETH Zurich|NUS|NTU)$/iu;
const EMPLOYMENT_TYPE = /^(?:full[ -]time|part[ -]time|contract|permanent|temporary|freelance|remote|hybrid|on[ -]site)(?:\s*[·,/]\s*(?:remote|hybrid|on[ -]site))?$/iu;
const DURATION = /^\(?\d+\s*(?:years?|yrs?|months?|mos?)(?:\s+\d+\s*(?:months?|mos?))?\)?$/iu;
const PROSE = /^(?:\d{1,3}[.)、]\s*)?(?:I|we|our|my|they|he|she|exploring|studying|investigating|manage|give|conduct|develop|design|perform|support|collaborate|coordinate|implement|maintain|ensure|prepare|provide|oversee|analyze|evaluate|optimize|participate|investigate|identify|generate|collect|present|write|focus|explore|data analysis|members? of|work closely|lead and|responsible for)\b/iu;
const COMPANY_SIGNAL = /\b(?:university|univ|college|institute|school|academy|hospital|inc|ltd|llc|corp(?:oration)?|company|pharma(?:ceuticals?|ceutical|tech)?|therapeutics?|biotechnology|biosciences?|biotech|gene|laborator(?:y|ies)|R\s*&\s*D|research\s+cent(?:er|re))\b/iu;
const LOCATION = /^(?:[A-Za-z .'-]+,\s*)?(?:China|USA|U\.?S\.?A?\.?|United States|UK|U\.?K\.?|United Kingdom|Canada|Australia|Germany|France|Japan|Singapore|Korea|CA|AZ|NY|MA|TX|PA|NJ)\.?$/iu;
export const isCredentialLine = (line: string): boolean => /^(?:[A-Z]{2,10}\s+)?(?:certified|certification|license|licensure|credentials?|board certified|professional certificates?)\b/iu.test(line);

function roleText(value: string): boolean {
  return !NARRATIVE.test(value) && !PROSE.test(value) && !/^lead\s+(?:internal|external|cross-functional|collaborations?)\b/iu.test(value) && !/\bprojects?\s*[).]*$/iu.test(value);
}

export function hasEnglishEmploymentRole(value: string): boolean {
  const candidate = withoutMentorAnnotations(value);
  return candidate.length <= 240 && ROLE.test(candidate) && !DEGREE.test(candidate) && roleText(candidate);
}

function englishDegree(value: string): string | null {
  // BE may be a Bachelor of Engineering, but the ordinary English verb "be"
  // must never be used as a degree label.
  return [...value.matchAll(new RegExp(DEGREE_PATTERN, "giu"))].map(match => match[0])
    .find(match => !(/^be$/iu.test(match) && match !== "BE")) ?? null;
}

export function hasEnglishDegree(value: string): boolean {
  return englishDegree(value) !== null;
}

export function educationDegree(value: string): string | null {
  return englishDegree(value) ?? value.match(/博士后|博士|硕士|本科|学士|大专|专科/u)?.[0] ?? null;
}

export function englishEducationMajor(value: string): string | null {
  if (/^(?:MBA\.?|Master(?:['’]s)?\s+of\s+Business Administration)$/iu.test(value.trim())) return "Business Administration";
  const program = DEGREE.test(value) ? value.replace(/\bfellowship\b/giu, "") : value;
  return program.replace(new RegExp(DEGREE_PATTERN, "giu"), "")
    .replace(new RegExp(DATE_RANGE_PATTERN, "giu"), "")
    .replace(/\((?:graduate(?:d)?\s+)?(?:with\s+)?(?:distinction|honou?rs?)\)/giu, "")
    .replace(/\bdegree\b/giu, "")
    .replace(/\(?\b(?:hons|honours?|honors?)\b\.?\)?/giu, "")
    .replace(/^[\s,;:()/-]*(?:in|of)\s+/iu, "")
    .replace(/\(\s*\)/gu, "")
    .replace(/^[\s,;:/-]+|[\s,;:./-]+$/gu, "") || null;
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
    .replace(/^(?:Singapore|Shanghai|Beijing|London|Guangzhou|Shenzhen)\.\s+(?=[A-Z])/iu, "")
    .replace(/^[^,]*\bScholar\b[^,]*,\s*(?=.*\b(?:University|School|College)\b)/iu, "");
}

function headerContinuation(previous: string, next: string): boolean {
  if (!next || rangeIn(next) || isResumeSection(next) || NARRATIVE.test(next) || PROSE.test(next) || FIELD.test(next)) return false;
  if (INSTITUTION.test(previous) && /\b(?:Biological|Life|Natural|Physical|Chemical|Social)\s*$/iu.test(previous) && /^(?:Sciences?|Medicine|Engineering|Technology)\b/iu.test(next)) return true;
  return /(?:\b(?:Research|Medical|Traditional Chinese|of|and|Ageing-related)|[,/-])$/iu.test(previous.trim()) && next.length < 160 && !DEGREE.test(next);
}

function joinedHeaderLines(lines: string[]): string[] {
  const joined: string[] = [];
  for (const line of lines) {
    if (joined.length && headerContinuation(joined.at(-1)!, line)) joined[joined.length - 1] += ` ${line}`;
    else joined.push(line);
  }
  return joined;
}

function headerText(value: string): string {
  return withoutMentorAnnotations(value)
    .replace(/\s*[,;.]?\s*\b(?:advisor|adviser|supervisor|mentor|report(?:s|ing)?\s+to)\s*[:：]?.*$/iu, "")
    .replace(/^(?:position|job title|title|role)\s*[:：]\s*/iu, "")
    .replace(/\s*:\s*\d+[.)].*$/u, "").trim();
}

function companyCandidate(value: string): boolean {
  const endsInCountry = /,\s*(?:China|USA|U\.?S\.?A?\.?|United States|UK|U\.?K\.?|United Kingdom|Canada|Australia|Germany|France|Japan|Singapore|Korea)\.$/iu.test(value);
  return Boolean(value) && value.length <= 180 && /^[A-Z\p{Script=Han}]/u.test(value) &&
    !/^(?:APAC|EMEA|LATAM|Life Sciences?)$/iu.test(value) &&
    !NARRATIVE.test(value) && !PROSE.test(value) && !/^assisted\b/iu.test(value) && !DEGREE.test(value) && (!LOCATION.test(value) || COMPANY_SIGNAL.test(value)) &&
    !isResumeSection(value) && !/[“”"?!]/u.test(value) &&
    !/\b(?:in this project|main project|projects?|to (?:keep|help|support|generate)|have been|has been|are conducted|and conduct|and validate)\b/iu.test(value) &&
    (endsInCountry || !/\.$/u.test(value.replace(/\b(?:Inc|Ltd|Corp|Co|U\.S\.A|U\.K)\./gu, "")));
}

function splitWorkHeader(part: string, isRole: (value: string) => boolean): string[] {
  const at = part.match(/^(.+?)\s+(?:at|@)\s+(.+)$/iu);
  if (at && isRole(at[1])) return [at[1], at[2]];
  const commaParts = part.split(/[,;]\s*/u).map(cleanPart).filter(Boolean);
  const roleIndex = commaParts.findIndex(isRole);
  if (roleIndex < 0 || commaParts.length < 2) return [part];
  // Keep legal suffixes with the preceding company and campus names with their university.
  const result: string[] = [];
  for (const value of commaParts) {
    if (/^(?:Inc\.?|Ltd\.?|LLC|Corp\.?|Co\.?)$/iu.test(value) && result.length && !isRole(result.at(-1)!)) result[result.length - 1] += `, ${value}`;
    else if (result.length && INSTITUTION.test(result.at(-1)!) && !isRole(value) && !COMPANY_SIGNAL.test(value)) result[result.length - 1] += `, ${value}`;
    else result.push(value);
  }
  return result;
}

function workBlock(lines: string[], inWorkSection: boolean, sectionRole?: string): Omit<InferredEnglishWork, "lineCount"> | null {
  // A degree-qualified fellowship can be a role when the author lists it as work.
  const isRole = (value: string) => hasEnglishEmploymentRole(value) ||
    (inWorkSection && value.length <= 240 && (ROLE.test(value) || /\bfellowship\b/iu.test(value)) && roleText(value));
  const text = joinedHeaderLines(lines.map(headerText)).join("\n");
  const dates = rangeIn(text);
  if (!dates) return null;
  const parts = contentParts(text, dates).flatMap(part => splitWorkHeader(part, isRole))
    .map(part => part.replace(/\s*:\s*\d+[.)].*$/u, ""))
    .filter(part => !EMPLOYMENT_TYPE.test(part) && !DURATION.test(part));
  const roles = parts.flatMap((part, index) => isRole(part) ? [index] : []);
  if (roles.length === 0 && sectionRole && parts.length && parts.every(part => companyCandidate(part) || LOCATION.test(part))) {
    const organizations = parts.flatMap(part => part.split(/,\s*/u)).filter(companyCandidate).reverse();
    const employer = organizations.find(part => INSTITUTION.test(part) || /\bMedical\s+Cent(?:er|re)\b/iu.test(part)) ?? organizations.find(part => ORGANIZATION.test(part));
    if (employer) return { company: organizationName(employer), title: sectionRole, dates };
  }
  if (roles.length !== 1 || parts.length < 2) return null;
  const roleIndex = roles[0];
  const candidates = [...parts.slice(0, roleIndex).reverse(), ...parts.slice(roleIndex + 1)]
    .filter(companyCandidate);
  // Tables can place a discipline between the employer and the position.
  const employer = candidates.find(part => COMPANY_SIGNAL.test(part) && !/^Department\b/iu.test(part)) ?? candidates.find(part => ORGANIZATION.test(part)) ?? candidates[0];
  if (!employer) return null;
  const company = organizationName(employer).replace(/\s*·\s*(?:full[ -]time|part[ -]time|contract|permanent|temporary|freelance)\b.*$/iu, "").trim();
  if (!companyCandidate(company)) return null;
  return { company, title: parts[roleIndex], dates };
}

export function englishSectionRole(heading: string): string | null {
  return /^postdoctoral\s+training\s*[:：]?$/iu.test(heading.trim()) ? heading.replace(/[:：]\s*$/u, "").trim() : null;
}

export function inferEnglishWorkAt(lines: readonly string[], index: number, inWorkSection = false, sectionRole?: string): InferredEnglishWork | null {
  // A tabular row can use a position abbreviation outside the role lexicon.
  // Only treat it as such when the work section and all three columns are
  // explicit and the middle column is exactly one complete date range.
  if (inWorkSection) {
    const fields = (lines[index] ?? "").split(/\t+/u).map(cleanPart);
    if (fields.length === 3 && fields.every(Boolean) &&
        new RegExp(`^(?:${DATE_RANGE_PATTERN})$`, "iu").test(fields[1]) &&
        companyCandidate(fields[0]) && fields[2].length <= 120 &&
        !FIELD.test(fields[2]) && !NARRATIVE.test(fields[2]) && !PROSE.test(fields[2]) &&
        !new RegExp(DATE_RANGE_PATTERN, "iu").test(fields[2])) {
      return { company: fields[0], title: fields[2], dates: fields[1], lineCount: 1 };
    }
  }
  const block: string[] = [];
  for (let offset = 0; offset < 4 && index + offset < lines.length; offset++) {
    const line = lines[index + offset];
    const header = headerText(line);
    if (!header || isResumeSection(line) || FIELD.test(header) || NARRATIVE.test(header) || PROSE.test(header)) break;
    if (offset && rangeIn(line)) {
      if (block.some(part => rangeIn(part))) break;
      // A self-contained dated header starts a new record, not a continuation of prior prose.
      if (workBlock([line], inWorkSection, sectionRole)) break;
    }
    block.push(header);
    const inferred = workBlock(block, inWorkSection, sectionRole);
    if (inferred && !headerContinuation(line, lines[index + offset + 1] ?? "")) return { ...inferred, lineCount: block.length };
  }
  if (inWorkSection) {
    // An explicit work section can name an employer and dates without a position.
    // Keep the missing title empty instead of borrowing an adjacent duty sentence.
    const first = headerText(lines[index] ?? "");
    const dates = rangeIn(first);
    const company = dates ? cleanPart(first.replace(dates, "")) : "";
    if (dates && companyCandidate(company) && COMPANY_SIGNAL.test(company) && !ROLE.test(company)) return { company, title: "", dates, lineCount: 1 };
  }
  return null;
}

function schoolPart(part: string): { school: string; rest: string } | null {
  const value = part.replace(/^(?:undergraduate|graduate)\s+student\s*,\s*/iu, "");
  const degree = value.match(DEGREE);
  const leadingDegree = degree?.index === 0 && INSTITUTION.test(value.slice(degree[0].length));
  let school = organizationName(cleanPart(leadingDegree ? value.slice(degree![0].length) : degree?.index === undefined ? value : value.slice(0, degree.index)));
  let rest = leadingDegree ? degree![0] : degree?.index === undefined ? "" : value.slice(degree.index);
  if (leadingDegree) {
    const fields = school.split(/,\s*/u);
    const institutionIndex = fields.findIndex(field => INSTITUTION.test(field));
    if (institutionIndex > 0 && fields.slice(0, institutionIndex).every(field => MAJOR.test(field) || /^degree$/iu.test(field))) {
      rest += ` ${fields.slice(0, institutionIndex).join(", ")}`;
      school = fields.slice(institutionIndex).join(", ");
    }
  }
  const programFields = school.split(/,\s*/u);
  const schoolIndex = programFields.findIndex(field => INSTITUTION.test(field));
  const programPrefix = /\b(?:exchange|program(?:me)?|semester|study abroad)\b/iu;
  if (schoolIndex > 0 && programFields.slice(0, schoolIndex).some(field => programPrefix.test(field)) &&
      programFields.slice(0, schoolIndex).every(field => programPrefix.test(field) || MAJOR.test(field))) {
    const programMajor = programFields.slice(0, schoolIndex).filter(field => !programPrefix.test(field)).join(", ");
    rest = `${rest} ${programMajor}`.trim();
    school = programFields.slice(schoolIndex).join(", ");
  }
  const institutionParts = school.split(/,\s*/u);
  const universityIndex = institutionParts.findIndex(value => /\b(?:University|Univ\.?|College|Polytechnic)\b/iu.test(value));
  if (universityIndex > 0 && institutionParts.slice(0, universityIndex).every(value => /\b(?:School|Department|Laboratory|Student)\b/iu.test(value))) school = institutionParts.slice(universityIndex).join(", ");
  const suffix = school.match(/^(.+?\b(?:University|College|Academy|Polytechnic|Institute(?: of Technology)?))\s+(.+)$/iu);
  if (suffix && !/^(?:of|at|and|in)\b/iu.test(suffix[2]) && MAJOR.test(suffix[2]) && !INSTITUTION.test(suffix[2])) {
    school = suffix[1];
    rest = `${suffix[2]} ${rest}`.trim();
  }
  if (!/^[A-Za-z]/u.test(school) || school.length > 160 || NARRATIVE.test(school) || hasEnglishEmploymentRole(school) || /\b(?:worked|responsible|project|collaborated|served|partnered)\b/iu.test(school)) return null;
  if (!INSTITUTION.test(school) && !/\b(?:cent(?:er|re)|laboratory)\b/iu.test(school) && !SCHOOL_ABBREVIATION.test(school) && normalizeSchool(school).method !== "ALIAS") return null;
  return { school, rest };
}

function educationBlock(lines: string[]): Omit<InferredEnglishEducation, "lineCount"> | null {
  const text = withoutMentorAnnotations(joinedHeaderLines(lines).join("\n"));
  if (hasEnglishEmploymentRole(text)) return null;
  const dates = rangeIn(text);
  if (!dates && new RegExp(DATE_RANGE_PATTERN, "iu").test(text)) return null;
  // Commas before a degree or major divide fields; commas in campus names stay intact.
  const separated = dates ? text.replace(dates, "").replace(/\(\s*\)\s*[-–—]\s*(?=[A-Z])/gu, " | ") : text;
  const parts = contentParts(separated, dates).flatMap(part => part.split(/,\s*(?=(?:Bachelor|Master|Doctor|B\.?[AS]|M\.?[AS]|MBA|Ph\.?D|Computer|Software|Electrical|Mechanical|Civil|Chemical|Biomedical|Business|Economics|Finance|Law|Medicine|Biology|Chemistry|Physics|Mathematics|Psychology|History|English|Nursing|Education|Immunology|Oncology|Pharmacology|Microbiology|Biochemistry|Neurobiology|Biotechnology|Cancer\s+Biology|Analytical\s+Chemistry)\b)/iu)).map(cleanPart).filter(Boolean);
  const schools = parts.map(schoolPart);
  const schoolIndexes = schools.flatMap((school, index) => school ? [index] : []);
  if (schoolIndexes.length !== 1 || (!dates && !DEGREE.test(text))) return null;
  const schoolIndex = schoolIndexes[0];
  const institution = schools[schoolIndex]!;
  if (!INSTITUTION.test(institution.school) && /\b(?:cent(?:er|re)|laboratory)\b/iu.test(institution.school) && !DEGREE.test(text)) return null;
  const programs = parts.flatMap((part, index) => {
    const value = index === schoolIndex ? institution.rest : part;
    if (LOCATION.test(value) || /^Department of\b/iu.test(value)) return [];
    const major = englishEducationMajor(value);
    return major ? [major] : [];
  });
  if (programs.some(program => !MAJOR.test(program) || program.length > 100 || NARRATIVE.test(program) || PROSE.test(program))) return null;
  return { school: institution.school, major: programs.join(" ") || null, dates };
}

export function inferEnglishEducationAt(lines: readonly string[], index: number): InferredEnglishEducation | null {
  const block: string[] = [];
  let inferred: InferredEnglishEducation | null = null;
  for (let offset = 0; offset < 4 && index + offset < lines.length; offset++) {
    const line = lines[index + offset];
    const program = line.match(/^(?:major|field of study|degree(?: award(?:ed)?)?|qualification|program(?:me)?|track)\s*[:：]\s*(.+)$/iu);
    if (!line || isResumeSection(line) || isCredentialLine(line) || (FIELD.test(line) && !program) || NARRATIVE.test(line) || PROSE.test(line)) break;
    if (offset) {
      if (rangeIn(line) && block.some(value => rangeIn(value))) break;
      if (DEGREE.test(line) && block.some(value => DEGREE.test(value))) break;
      if (inferred && schoolPart(line) && !headerContinuation(block.at(-1)!, line)) break;
      if (rangeIn(line) && !block.some(value => DEGREE.test(value) || schoolPart(value))) break;
    }
    if (hasEnglishEmploymentRole(line)) return inferred?.major ? inferred : null;
    block.push(program?.[1] ?? line);
    const candidate = educationBlock(block);
    if (candidate) inferred = { ...candidate, lineCount: block.length };
  }
  return inferred;
}
