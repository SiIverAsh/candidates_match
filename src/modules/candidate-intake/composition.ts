import { employeeDataApplication } from "../employee-data/composition";
import { getCandidateReadiness } from "./application/get-readiness";
import { getCandidateQuery, listCandidates } from "./application/browse-candidates";
import {
  submitCandidate,
  type SubmitCandidateCommand,
} from "./application/submit-candidate";
import { prepareResumeFile } from "./infrastructure/file/prepare-resume-file";
import {
  createCandidateQuery,
  purgeExpiredCandidateQueries,
  findCandidateQuery,
  listCandidateQueries,
} from "./infrastructure/sqlite/repository";

const employeeVersions = {
  readiness: () => {
    const activeVersion = employeeDataApplication.getOverview().activeVersion;
    return {
      ready: Boolean(activeVersion),
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
    create: createCandidateQuery,
    purgeExpired: purgeExpiredCandidateQueries,
  },
  employeeVersions,
  now: () => new Date(),
  createId: () => crypto.randomUUID(),
};

export const candidateIntakeApplication = {
  list: (requestedBy: string, input: { page?: number; search?: string; resultsOnly?: boolean }) => {
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
