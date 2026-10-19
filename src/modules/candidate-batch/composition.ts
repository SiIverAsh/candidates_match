import { setImmediate } from "node:timers/promises";
import { candidateIntakeApplication } from "../candidate-intake/composition";
import { resumeParserApplication } from "../resume-parser/composition";
import { matchingApplication } from "../matching/composition";
import { auditApplication } from "../audit/composition";
import { processBatch, validateBatch, type BatchCommand } from "./application/process-batch";
import type { BatchActor, BatchDependencies, BatchFile } from "./application/ports";
import { prepareCandidateWorkbook } from "./application/prepare-workbook";
import { candidateWorkbookParser } from "./infrastructure/parse-candidate-workbook";

const dependencies: BatchDependencies = {
  submit: candidateIntakeApplication.submit,
  parse: resumeParserApplication.parse,
  match: matchingApplication.run,
  findQuery: candidateIntakeApplication.getQuery,
  findProfile: resumeParserApplication.getProfile,
  record: (actorId, outcome) => auditApplication.record({ actorId, actionType: "CANDIDATE_BATCH", resourceRef: null, outcome }),
  yieldControl: () => setImmediate(),
};
export const candidateBatchApplication = {
  prepareWorkbook: (file: BatchFile) => prepareCandidateWorkbook(file, candidateWorkbookParser),
  validate: validateBatch,
  process: (command: BatchCommand, actor: BatchActor, signal?: AbortSignal) => processBatch(command, actor, dependencies, signal),
};
