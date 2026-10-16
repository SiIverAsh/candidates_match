import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { ResumeSourceRepository } from "../../application/ports";
import type { CandidateProfile, ResumeSource } from "../../domain/models";

const globalForResumeParser = globalThis as unknown as { resumeParserDatabase?: DatabaseSync };

function getDatabase(): DatabaseSync {
  if (!globalForResumeParser.resumeParserDatabase) {
    const filePath = process.env.CONNECTION_FINDER_DB_PATH ??
      path.join(process.cwd(), "var", "connection-finder.sqlite");
    mkdirSync(path.dirname(filePath), { recursive: true });
    const database = new DatabaseSync(filePath);
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("PRAGMA journal_mode = WAL");
    database.exec(`
      CREATE TABLE IF NOT EXISTS candidate_profiles (
        query_id TEXT PRIMARY KEY,
        submitted_by TEXT NOT NULL,
        parse_status TEXT NOT NULL CHECK (
          parse_status IN ('COMPLETE', 'PARTIAL', 'INSUFFICIENT', 'FAILED')
        ),
        profile_json TEXT NOT NULL,
        parser_version TEXT NOT NULL,
        normalizer_version TEXT NOT NULL,
        parsed_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (query_id) REFERENCES candidate_queries(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS candidate_profiles_expiry
        ON candidate_profiles(expires_at);
    `);
    globalForResumeParser.resumeParserDatabase = database;
  }
  return globalForResumeParser.resumeParserDatabase;
}

interface SourceRow {
  id: string;
  submitted_by: string;
  source_type: "FILE" | "TEXT";
  source_format: ResumeSource["sourceFormat"];
  content_text: string | null;
  content_blob: Uint8Array | null;
  expires_at: string;
}

export function findResumeSource(
  queryId: string,
  requestedBy: string,
  now: string,
): ResumeSource | null {
  const row = getDatabase().prepare(`
    SELECT id, submitted_by, source_type, source_format,
           content_text, content_blob, expires_at
    FROM candidate_queries
    WHERE id = ? AND submitted_by = ? AND expires_at > ?
  `).get(queryId, requestedBy, now) as unknown as SourceRow | undefined;
  if (!row) return null;
  return {
    queryId: row.id,
    submittedBy: row.submitted_by,
    sourceType: row.source_type,
    sourceFormat: row.source_format,
    text: row.content_text,
    bytes: row.content_blob ? new Uint8Array(row.content_blob) : null,
    expiresAt: row.expires_at,
  };
}

export function findCandidateProfile(
  queryId: string,
  requestedBy: string,
  now: string,
): CandidateProfile | null {
  const row = getDatabase().prepare(`
    SELECT profile_json
    FROM candidate_profiles
    WHERE query_id = ? AND submitted_by = ? AND expires_at > ?
  `).get(queryId, requestedBy, now) as { profile_json: string } | undefined;
  return row ? JSON.parse(row.profile_json) as CandidateProfile : null;
}

export function saveCandidateProfile(profile: CandidateProfile, requestedBy: string): void {
  const database = getDatabase();
  const ownsQuery = database.prepare(`
    SELECT 1 FROM candidate_queries
    WHERE id = ? AND submitted_by = ? AND expires_at > ?
  `).get(profile.queryId, requestedBy, profile.parsedAt);
  if (!ownsQuery) throw new Error("QUERY_NOT_AVAILABLE");

  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`
      INSERT INTO candidate_profiles (
        query_id, submitted_by, parse_status, profile_json,
        parser_version, normalizer_version, parsed_at, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(query_id) DO UPDATE SET
        parse_status = excluded.parse_status,
        profile_json = excluded.profile_json,
        parser_version = excluded.parser_version,
        normalizer_version = excluded.normalizer_version,
        parsed_at = excluded.parsed_at,
        expires_at = excluded.expires_at
    `).run(
      profile.queryId,
      requestedBy,
      profile.parseStatus,
      JSON.stringify(profile),
      profile.parserVersion,
      profile.normalizerVersion,
      profile.parsedAt,
      profile.expiresAt,
    );
    // A regenerated profile invalidates matches produced from its previous parse.
    if (database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'match_runs'").get()) {
      database.prepare("DELETE FROM match_runs WHERE query_id = ? AND submitted_by = ?").run(profile.queryId, requestedBy);
    }
    database.prepare(`
      INSERT INTO audit_events (
        id, actor_id, action_type, resource_ref, outcome, created_at
      ) VALUES (?, ?, 'CANDIDATE_PROFILE_PARSED', ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      requestedBy,
      profile.queryId,
      profile.parseStatus,
      profile.parsedAt,
    );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export const resumeSourceRepository: ResumeSourceRepository = {
  findSource: findResumeSource,
  findProfile: findCandidateProfile,
  saveProfile: saveCandidateProfile,
};
