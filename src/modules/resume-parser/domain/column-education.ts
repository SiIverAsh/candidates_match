import { DATE_RANGE_PATTERN } from "./dates";
import { educationDegree } from "./english-experiences";

/** School, degree and date must each be separate explicit columns. */
export function inferColumnEducation(line: string): { school: string; major: string; dates: string; degree: string } | null {
  const fields = line.split(/\s*\|\s*|\t+| {2,}/u).map(field => field.trim()).filter(Boolean);
  if (fields.length < 3 || !/\b(?:university|college|institute|school|academy|polytechnic)\b/iu.test(fields[0])) return null;
  const dates = fields.at(-1)!;
  if (!new RegExp(`^(?:${DATE_RANGE_PATTERN})$`, "iu").test(dates)) return null;
  const program = fields[1].match(/^(Ph\.?\s?D\.?|doctor(?:ate)?|master(?:['’]s)?|bachelor(?:['’]s)?)\s+(?:student\s+)?(?:in|of)\s+(.+)$/iu);
  if (!program || !program[2].trim() || !fields.slice(2, -1).every(field => /^(?:advisor|adviser|supervisor|mentor|ranking)\s*[:：]/iu.test(field))) return null;
  const degree = educationDegree(program[1]);
  return degree ? { school: fields[0], major: program[2].trim(), dates, degree } : null;
}
