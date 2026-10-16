import type { CandidateProfile, ResumeSource } from "../domain/models";

export interface ResumeSourceRepository {
  findSource(queryId: string, requestedBy: string, now: string): ResumeSource | null;
  findProfile(queryId: string, requestedBy: string, now: string): CandidateProfile | null;
  saveProfile(profile: CandidateProfile, requestedBy: string): void;
}

export type TextExtractionResult =
  | { ok: true; text: string }
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
  now(): Date;
}
