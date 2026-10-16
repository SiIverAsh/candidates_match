import { getMatchRun, runMatching } from "./application/run-matching";
import { runMatchingEngine } from "./domain/engine";
import { matchingRepository } from "./infrastructure/sqlite/repository";

const dependencies = {
  repository: matchingRepository,
  engine: { run: runMatchingEngine },
  now: () => new Date(),
  createId: () => crypto.randomUUID(),
};

export const matchingApplication = {
  run: (queryId: string, requestedBy: string) =>
    runMatching(queryId, requestedBy, dependencies),
  getRun: (queryId: string, requestedBy: string) =>
    getMatchRun(queryId, requestedBy, dependencies),
};
