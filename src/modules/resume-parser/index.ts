import type { ProductModule } from "../module.types";

export const resumeParserModule: ProductModule = {
  id: "resume-parser",
  name: "简历解析与实体标准化",
  stage: "core",
  description: "提取并标准化工作与教育经历，同时保留来源精度。",
};

export type {
  CandidateProfile,
  CandidateWorkExperience,
  CandidateEducationExperience,
  DatePrecision,
  ExperienceDateRange,
  ParseStatus,
} from "./domain/models";
export type { ParseCandidateQueryResult } from "./application/parse-candidate-query";
export {
  NORMALIZER_VERSION,
  normalizeCompany,
  normalizeFunction,
  normalizeMajor,
  normalizeSchool,
} from "./domain/normalization";
export { PARSER_VERSION } from "./infrastructure/parsing/parse-resume-text";
