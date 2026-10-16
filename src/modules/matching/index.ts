import type { ProductModule } from "../module.types";

export const matchingModule: ProductModule = {
  id: "matching",
  name: "混合式关系匹配",
  stage: "core",
  description: "计算关系信号、置信度、排序和可追溯证据。",
};

export type {
  EmployeeMatchResult,
  MatchConfidence,
  MatchEvidence,
  MatchRun,
  MatchRunStatus,
} from "./domain/models";
export type { RunMatchingResult } from "./application/run-matching";
