import type { CandidateQuery } from "../../candidate-intake/domain/models";
import type { CandidateProfile } from "../../resume-parser/domain/models";
import type { MatchRun } from "../../matching/domain/models";
import type { WorkbookCandidateRow } from "../domain/workbook";
import type { BatchReport } from "../domain/report";

export interface BatchReportWriter {
  write(report: BatchReport): Promise<Uint8Array<ArrayBuffer>>;
}

export interface BatchFile {
  name: string;
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface BatchActor { id: string; displayName: string }
export interface CandidateWorkbookParser {
  parse(bytes: ArrayBuffer): Promise<WorkbookCandidateRow[]>;
}
export interface BatchDependencies {
  submit(input: { actor: BatchActor; file: BatchFile | null; text: string | null; textOrigin?: "WORKBOOK_ROW" }): Promise<
    { kind: "accepted"; query: CandidateQuery; reused?: boolean } | { kind: "rejected" | "persistence_failed"; message: string }
  >;
  parse(queryId: string, actorId: string): Promise<
    { kind: "profile"; profile: CandidateProfile } | { kind: "not_found" | "persistence_failed"; message: string }
  >;
  match(queryId: string, actorId: string):
    { kind: "matched"; run: MatchRun; reused?: boolean } | { kind: "no_employee_version" | "not_found" | "persistence_failed"; message: string };
  findQuery(queryId: string, actorId: string): CandidateQuery | null;
  findProfile(queryId: string, actorId: string): CandidateProfile | null;
  record(actorId: string, outcome: string): void;
  yieldControl(): Promise<void>;
}
