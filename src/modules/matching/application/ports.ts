import type { CandidateProfile } from "../../resume-parser";
import type { MatchRun } from "../domain/models";

export interface EmployeeWorkSnapshot {
  sequence: number;
  company: string;
  title: string;
  startDate: string;
  endDate: string | null;
}

export interface EmployeeEducationSnapshot {
  sequence: number;
  school: string;
  major: string;
  startDate: string;
  endDate: string | null;
}

export interface EmployeeSnapshot {
  employeeId: string;
  name: string;
  email: string;
  currentDepartment: string;
  currentTitle: string;
  workExperiences: EmployeeWorkSnapshot[];
  educations: EmployeeEducationSnapshot[];
}

export interface MatchingContext {
  queryId: string;
  submittedBy: string;
  submittedAt: string;
  expiresAt: string;
  employeeVersionId: string | null;
  profile: CandidateProfile;
  employees: EmployeeSnapshot[];
}

export interface MatchingRepository {
  // Reads and deduplication share the recruiting workspace; requestedBy identifies the audit actor.
  findActiveEmployeeVersion(): string | null;
  loadContext(queryId: string, requestedBy: string, now: string, employeeVersionId: string | null): MatchingContext | null;
  saveRun(run: MatchRun, requestedBy: string): MatchRun;
  findRun(queryId: string, requestedBy: string, now: string): MatchRun | null;
}

export interface MatchEngine {
  run(context: MatchingContext, runId: string, createdAt: string): MatchRun;
}

export interface MatchingDependencies {
  repository: MatchingRepository;
  engine: MatchEngine;
  now(): Date;
  createId(): string;
}
