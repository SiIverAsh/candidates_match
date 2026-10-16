import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import type { SubmitCandidateResult } from "@/modules/candidate-intake/application/submit-candidate";
import type { CandidateReadiness } from "@/modules/candidate-intake/domain/models";
import type { CandidateQuery } from "@/modules/candidate-intake/domain/models";
import type { CandidateQueryPage } from "@/modules/candidate-intake/domain/models";
import type { EmployeeDataOverview } from "@/modules/employee-data/domain/models";
import type { EmployeeDirectoryPage, EmployeeProfile } from "@/modules/employee-data/domain/models";
import type { ImportActionState } from "@/modules/employee-data/presentation/contracts";
import type { RunMatchingResult } from "@/modules/matching/application/run-matching";
import type { MatchRun } from "@/modules/matching/domain/models";
import type { ParseCandidateQueryResult } from "@/modules/resume-parser/application/parse-candidate-query";
import type { CandidateProfile } from "@/modules/resume-parser/domain/models";

export type CandidateSubmissionResult =
  | {
      kind: "accepted";
      query: CandidateQuery;
      parsing: ParseCandidateQueryResult;
      matching: RunMatchingResult | null;
    }
  | Exclude<SubmitCandidateResult, { kind: "accepted" }>;

export interface CandidateDetail {
  query: CandidateQuery;
  profile: CandidateProfile | null;
  run: MatchRun | null;
}

export interface ResumePreview { text: string | null; sourceFormat: string; message?: string }

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new ApiError(response.status, payload?.error ?? "REQUEST_FAILED");
  }
  return response.json() as Promise<T>;
}

export const api = {
  candidates(page = 1, search = "", resultsOnly = false): Promise<CandidateQueryPage> {
    const params = new URLSearchParams({ page: String(page), search, resultsOnly: resultsOnly ? "1" : "0" });
    return request(`/api/candidate-intake/queries?${params}`);
  },

  candidateDetail(queryId: string): Promise<CandidateDetail> {
    return request(`/api/candidate-intake/queries/${encodeURIComponent(queryId)}`);
  },

  resumePreview(queryId: string): Promise<ResumePreview> {
    return request(`/api/resume-parser/queries/${encodeURIComponent(queryId)}/preview`);
  },

  employees(page = 1, search = ""): Promise<EmployeeDirectoryPage> {
    return request(`/api/admin/employee-data/employees?${new URLSearchParams({ page: String(page), search })}`);
  },

  async employeeProfile(employeeId: string, versionId: string): Promise<EmployeeProfile> {
    const result = await request<{ profile: EmployeeProfile }>(`/api/admin/employee-data/employees/${encodeURIComponent(employeeId)}?${new URLSearchParams({ versionId })}`);
    return result.profile;
  },
  async session(): Promise<AuthenticatedUser | null> {
    try {
      const result = await request<{ user: AuthenticatedUser }>("/api/auth/session");
      return result.user;
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  async login(name: string, password: string): Promise<AuthenticatedUser> {
    const result = await request<{ user: AuthenticatedUser }>("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });
    return result.user;
  },

  async logout(): Promise<void> {
    await request<{ ok: true }>("/api/auth/logout", { method: "POST" });
  },

  employeeOverview(): Promise<EmployeeDataOverview> {
    return request<EmployeeDataOverview>("/api/admin/employee-data");
  },

  importEmployees(file: File): Promise<ImportActionState> {
    const form = new FormData();
    form.set("employeeFile", file);
    return request<ImportActionState>("/api/admin/employee-data", {
      method: "POST",
      body: form,
    });
  },

  candidateReadiness(): Promise<CandidateReadiness> {
    return request<CandidateReadiness>("/api/candidate-intake/readiness");
  },

  submitCandidate(input: {
    file: File | null;
    text: string | null;
  }): Promise<CandidateSubmissionResult> {
    const form = new FormData();
    if (input.file) form.set("resumeFile", input.file);
    if (input.text) form.set("resumeText", input.text);
    return request<CandidateSubmissionResult>("/api/candidate-intake/queries", {
      method: "POST",
      body: form,
    });
  },

  parseCandidate(queryId: string): Promise<ParseCandidateQueryResult> {
    return request<ParseCandidateQueryResult>(
      `/api/resume-parser/queries/${encodeURIComponent(queryId)}/parse`,
      { method: "POST" },
    );
  },

  async candidateProfile(queryId: string): Promise<CandidateProfile> {
    const result = await request<{ profile: CandidateProfile }>(
      `/api/resume-parser/queries/${encodeURIComponent(queryId)}/profile`,
    );
    return result.profile;
  },

  runMatching(queryId: string): Promise<RunMatchingResult> {
    return request<RunMatchingResult>(
      `/api/matching/queries/${encodeURIComponent(queryId)}/run`,
      { method: "POST" },
    );
  },

  async matchRun(queryId: string): Promise<MatchRun> {
    const result = await request<{ run: MatchRun }>(
      `/api/matching/queries/${encodeURIComponent(queryId)}/result`,
    );
    return result.run;
  },
};
