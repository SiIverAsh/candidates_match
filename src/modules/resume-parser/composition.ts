import {
  getCandidateProfile,
  parseCandidateQuery,
} from "./application/parse-candidate-query";
import { extractResumeText } from "./infrastructure/extraction/extract-resume-text";
import { getResumePreview } from "./application/get-resume-preview";
import {
  failedCandidateProfile,
  parseResumeText,
} from "./infrastructure/parsing/parse-resume-text";
import { resumeSourceRepository } from "./infrastructure/sqlite/repository";

const dependencies = {
  repository: resumeSourceRepository,
  extractor: { extract: extractResumeText },
  parser: { parse: parseResumeText, failed: failedCandidateProfile },
  now: () => new Date(),
};

export const resumeParserApplication = {
  getPreview: (queryId: string, requestedBy: string) => getResumePreview(queryId, requestedBy, dependencies),
  parse: (queryId: string, requestedBy: string) =>
    parseCandidateQuery(queryId, requestedBy, dependencies),
  getProfile: (queryId: string, requestedBy: string) =>
    getCandidateProfile(queryId, requestedBy, dependencies),
};
