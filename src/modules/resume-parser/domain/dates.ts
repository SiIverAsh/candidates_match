import type { DatePrecision, ExperienceDateRange } from "./models";

interface ParsedDate {
  value: string;
  precision: DatePrecision;
}

// PDF text items can split digits. Only tolerate horizontal spaces inside dates,
// keeping source text intact and avoiding joins across separate lines or fields.
const DATE_COMPONENT = String.raw`\d(?:[ \t]*\d)?(?![ \t]*\d)`;
const YEAR_PATTERN = String.raw`(?:1[ \t]*9|2[ \t]*0)[ \t]*\d[ \t]*\d`;
const MONTH_PATTERN = String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?`;
const NUMERIC_DATE = String.raw`(?<!\d)${YEAR_PATTERN}(?:[ \t]*(?:[./-][ \t]*${DATE_COMPONENT}(?:[ \t]*[./-][ \t]*${DATE_COMPONENT})?|年(?:[ \t]*${DATE_COMPONENT}[ \t]*月(?:[ \t]*${DATE_COMPONENT}[ \t]*日)?)?))?(?!\d)`;
const ENGLISH_DATE = String.raw`\b(?:${MONTH_PATTERN}[ \t./-]+(?:\d{1,2}(?:st|nd|rd|th)?[ ,\t./-]+)?${YEAR_PATTERN}|\d{1,2}(?:st|nd|rd|th)?[ \t]+${MONTH_PATTERN}[ ,\t]+${YEAR_PATTERN})(?!\d)`;
const MONTH_YEAR = String.raw`(?<![\d/.])(?:0?[1-9]|1[0-2])[/.-]${YEAR_PATTERN}(?!\d)`;
export const DATE_POINT_PATTERN = String.raw`(?:${ENGLISH_DATE}|${MONTH_YEAR}|${NUMERIC_DATE})`;
export const DATE_RANGE_PATTERN = String.raw`${DATE_POINT_PATTERN}\s*(?:[-—–‐‑‒−~～]+|至|到|\b(?:to|until|till|through)\b)\s*(?:${DATE_POINT_PATTERN}|至[ \t]*今|今|现[ \t]*在|\b(?:(?:till\s+)?now|present|current|ongoing|(?:to\s+)?date)\b)`;
const DATE_TOKEN = new RegExp(DATE_POINT_PATTERN, "giu");
const CURRENT_VALUE = /(?:至|到|[-—–‐‑‒−~～])[ \t]*今|现[ \t]*在|\b(?:present|current|now|ongoing|to\s+date)\b/iu;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function parseDateToken(token: string): ParsedDate | null {
  const namedMonth = token.match(new RegExp(MONTH_PATTERN, "iu"));
  if (namedMonth) {
    const yearToken = token.match(new RegExp(YEAR_PATTERN, "u"))![0];
    const year = Number(yearToken.replace(/[ \t]/gu, ""));
    const month = MONTHS.indexOf(namedMonth[0].slice(0, 3).toLowerCase()) + 1;
    const dayToken = token.replace(namedMonth[0], "").replace(yearToken, "").match(/\d+/u);
    return dateValue(year, month, dayToken ? Number(dayToken[0]) : undefined);
  }
  const monthYear = token.match(/^(\d{1,2})[/.-]((?:1[ \t]*9|2[ \t]*0)[ \t]*\d[ \t]*\d)$/u);
  if (monthYear) return dateValue(Number(monthYear[2].replace(/[ \t]/gu, "")), Number(monthYear[1]));
  const parts = token.replace(/[ \t]/gu, "").match(/\d+/g)?.map(Number) ?? [];
  if (parts.length === 0) return null;
  const [year, month, day] = parts;
  return dateValue(year, month, day);
}

function dateValue(year: number, month?: number, day?: number): ParsedDate | null {
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
  const current = CURRENT_VALUE.test(raw);

  return {
    raw,
    start: start?.value ?? null,
    end: current ? null : end?.value ?? null,
    startPrecision: start?.precision ?? "UNKNOWN",
    endPrecision: current ? "UNKNOWN" : end?.precision ?? "UNKNOWN",
    current,
  };
}
