import type { DatePrecision } from "@/types";

export interface PartialDate {
  year: number;
  month?: number;
  day?: number;
  precision: DatePrecision;
}

export interface DateRange {
  start?: PartialDate;
  end?: PartialDate;
}

export function hasComparableYears(range: DateRange): boolean {
  return Boolean(range.start?.year || range.end?.year);
}
