import { employeeDataApplication } from "../employee-data/composition";
import { getCandidateReadiness } from "./application/get-readiness";
import { browseCandidates, getCandidateQuery, listCandidates, type CandidateListInput } from "./application/browse-candidates";
import { resumeParserApplication } from "../resume-parser/composition";
import {
  submitCandidate,
  type SubmitCandidateCommand,
} from "./application/submit-candidate";
import { prepareResumeFile } from "./infrastructure/file/prepare-resume-file";
import {
  createOrReuseCandidateQuery,
  purgeExpiredCandidateQueries,
  findCandidateQuery,
  listCandidateQueries,
} from "./infrastructure/sqlite/repository";

const employeeVersions = {
  readiness: () => {
    const activeVersion = employeeDataApplication.getOverview().activeVersion;
    return {
      ready: Boolean(activeVersion && activeVersion.employeeCount > 0),
      activeVersion: activeVersion
        ? {
            id: activeVersion.id,
            importedAt: activeVersion.importedAt,
            employeeCount: activeVersion.employeeCount,
          }
        : null,
    };
  },
};

const dependencies = {
  files: { prepare: prepareResumeFile },
  repository: {
    createOrReuse: createOrReuseCandidateQuery,
    purgeExpired: purgeExpiredCandidateQueries,
  },
  employeeVersions,
  now: () => new Date(),
  createId: () => crypto.randomUUID(),
};

export const candidateIntakeApplication = {
  browse: (requestedBy: string, input: CandidateListInput) => {
    employeeVersions.readiness();
    return browseCandidates(requestedBy, input, {
      repository: { list: listCandidateQueries, find: findCandidateQuery },
      ensureFunctions: resumeParserApplication.ensureAllFunctions,
      now: () => new Date().toISOString(),
    });
  },
  list: (requestedBy: string, input: CandidateListInput) => {
    employeeVersions.readiness();
    return listCandidates(requestedBy, input, { list: listCandidateQueries, find: findCandidateQuery }, new Date().toISOString());
  },
  getQuery: (queryId: string, requestedBy: string) => {
    employeeVersions.readiness();
    return getCandidateQuery(queryId, requestedBy, { list: listCandidateQueries, find: findCandidateQuery }, new Date().toISOString());
  },
  getReadiness: () => getCandidateReadiness(employeeVersions),
  purgeExpired: (now = new Date().toISOString()) => purgeExpiredCandidateQueries(now),
  submit: (command: SubmitCandidateCommand) => submitCandidate(command, dependencies),
};
