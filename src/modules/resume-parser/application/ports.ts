import type { CandidateProfile, ResumeSource } from "../domain/models";
import type { PersonIdentity } from "../../../shared/domain/person-identity";
import type { ResearchFunctionAssessment, ResearchWorkSource } from "../../research-functions/domain/models";

export interface ResumeSourceRepository {
  // Sources and profiles share the recruiting workspace; writes retain the original submitter.
  findSource(queryId: string, requestedBy: string, now: string): ResumeSource | null;
  findProfile(queryId: string, requestedBy: string, now: string): CandidateProfile | null;
  saveProfile(profile: CandidateProfile, requestedBy: string, reuseExisting?: boolean): CandidateProfile;
  findMissingFunctionQueryIds(now: string): string[];
  saveFunctionAssessment(queryId: string, assessment: ResearchFunctionAssessment, requestedBy: string, now: string): CandidateProfile | null;
  saveIdentity(queryId: string, identity: PersonIdentity, requestedBy: string, now: string): CandidateProfile | null;
}

export type TextExtractionResult =
  | { ok: true; text: string; warnings?: string[] }
  | { ok: false; code: string; message: string };

export interface ResumeTextExtractor {
  extract(source: ResumeSource): Promise<TextExtractionResult>;
}

export interface ResumeProfileParser {
  parse(source: ResumeSource, text: string, parsedAt: string): CandidateProfile;
  failed(source: ResumeSource, parsedAt: string, warning: string): CandidateProfile;
}

export interface ResumeParserDependencies {
  repository: ResumeSourceRepository;
  extractor: ResumeTextExtractor;
  parser: ResumeProfileParser;
  functionClassifier?: { classify(work: ResearchWorkSource[]): ResearchFunctionAssessment };
  now(): Date;
}
