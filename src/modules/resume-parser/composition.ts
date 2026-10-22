import {
  getCandidateProfile,
  ensureCandidateProfile,
  parseCandidateQuery,
  createResearchFunctionReader,
} from "./application/parse-candidate-query";
import { extractResumeText } from "./infrastructure/extraction/extract-resume-text";
import { getResumePreview } from "./application/get-resume-preview";
import {
  failedCandidateProfile,
  parseResumeText,
} from "./infrastructure/parsing/parse-resume-text";
import { resumeSourceRepository } from "./infrastructure/sqlite/repository";
import { researchFunctions } from "../research-functions/composition";

const dependencies = {
  repository: resumeSourceRepository,
  extractor: { extract: extractResumeText },
  parser: { parse: parseResumeText, failed: failedCandidateProfile },
  functionClassifier: researchFunctions,
  now: () => new Date(),
};

const functionReader = createResearchFunctionReader(dependencies);

export const resumeParserApplication = {
  ensureFunctions: functionReader.ensure,
  ensureAllFunctions: functionReader.ensureAll,
  ensureProfile: (queryId: string, requestedBy: string) =>
    ensureCandidateProfile(queryId, requestedBy, dependencies),
  getPreview: (queryId: string, requestedBy: string) => getResumePreview(queryId, requestedBy, dependencies),
  parse: (queryId: string, requestedBy: string) =>
    parseCandidateQuery(queryId, requestedBy, dependencies),
  getProfile: (queryId: string, requestedBy: string) =>
    getCandidateProfile(queryId, requestedBy, dependencies),
};
