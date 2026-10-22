import { z } from "zod";
import { CANDIDATE_MATCH_STATUSES, CANDIDATE_PARSE_STATUSES, CANDIDATE_SOURCE_FORMATS } from "../domain/column-filters";
import { CANDIDATE_FUNCTION_FILTERS } from "../domain/possible-functions";

export const candidateColumnFiltersSchema = z.object({
  name: z.string().trim().max(100).optional(),
  submittedBy: z.string().trim().max(100).optional(),
  possibleFunctions: z.array(z.enum(CANDIDATE_FUNCTION_FILTERS)).max(CANDIDATE_FUNCTION_FILTERS.length).optional(),
  parseStatuses: z.array(z.enum(CANDIDATE_PARSE_STATUSES)).max(CANDIDATE_PARSE_STATUSES.length).optional(),
  sourceFormats: z.array(z.enum(CANDIDATE_SOURCE_FORMATS)).max(CANDIDATE_SOURCE_FORMATS.length).optional(),
  matchStatuses: z.array(z.enum(CANDIDATE_MATCH_STATUSES)).max(CANDIDATE_MATCH_STATUSES.length).optional(),
  submittedFrom: z.string().date().optional(),
  submittedTo: z.string().date().optional(),
  expiresFrom: z.string().date().optional(),
  expiresTo: z.string().date().optional(),
}).strict().refine(value => !value.submittedFrom || !value.submittedTo || value.submittedFrom <= value.submittedTo)
  .refine(value => !value.expiresFrom || !value.expiresTo || value.expiresFrom <= value.expiresTo);
