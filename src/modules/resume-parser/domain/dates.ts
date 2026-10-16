import type { DatePrecision, ExperienceDateRange } from "./models";

interface ParsedDate {
  value: string;
  precision: DatePrecision;
}

// PDF text items can split digits. Only tolerate horizontal spaces inside dates,
// keeping source text intact and avoiding joins across separate lines or fields.
const DATE_COMPONENT = String.raw`\d(?:[ \t]*\d)?(?![ \t]*\d)`;
export const DATE_POINT_PATTERN = String.raw`(?<!\d)(?:1[ \t]*9|2[ \t]*0)[ \t]*\d[ \t]*\d(?:[ \t]*(?:[./-][ \t]*${DATE_COMPONENT}(?:[ \t]*[./-][ \t]*${DATE_COMPONENT})?|年(?:[ \t]*${DATE_COMPONENT}[ \t]*月(?:[ \t]*${DATE_COMPONENT}[ \t]*日)?)?))?(?!\d)`;
export const DATE_RANGE_PATTERN = String.raw`${DATE_POINT_PATTERN}\s*(?:—|–|~|～|至|到|-|\bto\b)\s*(?:${DATE_POINT_PATTERN}|至今|现在|present|current|now)`;
const DATE_TOKEN = new RegExp(DATE_POINT_PATTERN, "gu");
const CURRENT_VALUE = /^(?:至今|现在|今|present|current|now)$/iu;

function parseDateToken(token: string): ParsedDate | null {
  const parts = token.replace(/[ \t]/gu, "").match(/\d+/g)?.map(Number) ?? [];
  if (parts.length === 0) return null;
  const [year, month, day] = parts;
  if (year < 1900 || year > 2100) return null;
  if (month === undefined) return { value: String(year), precision: "YEAR" };
  if (month < 1 || month > 12) return null;
  const monthValue = `${year}-${String(month).padStart(2, "0")}`;
  if (day === undefined) return { value: monthValue, precision: "MONTH" };
  if (day < 1 || day > 31) return null;
  return { value: `${monthValue}-${String(day).padStart(2, "0")}`, precision: "DAY" };
}

export function parseDateRange(rawInput: string | null): ExperienceDateRange {
  const raw = rawInput?.trim() || null;
  if (!raw) {
    return {
      raw: null,
      start: null,
      end: null,
      startPrecision: "UNKNOWN",
      endPrecision: "UNKNOWN",
      current: false,
    };
  }

  const tokens = raw.match(DATE_TOKEN) ?? [];
  const start = tokens[0] ? parseDateToken(tokens[0]) : null;
  const end = tokens[1] ? parseDateToken(tokens[1]) : null;
  const trailing = raw
    .replace(tokens[0] ?? "", "")
    .replace(tokens[1] ?? "", "")
    .replace(/[\s至到—–~～-]/g, "");
  const current = CURRENT_VALUE.test(trailing) || /(?:至今|现在|present|current|now)/iu.test(raw);

  return {
    raw,
    start: start?.value ?? null,
    end: current ? null : end?.value ?? null,
    startPrecision: start?.precision ?? "UNKNOWN",
    endPrecision: current ? "UNKNOWN" : end?.precision ?? "UNKNOWN",
    current,
  };
}
