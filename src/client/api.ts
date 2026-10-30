import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import type { SubmitCandidateResult } from "@/modules/candidate-intake/application/submit-candidate";
import type { CandidateReadiness } from "@/modules/candidate-intake/domain/models";
import type { CandidateQuery } from "@/modules/candidate-intake/domain/models";
import type { CandidateMatchCategory, CandidateQueryPage } from "@/modules/candidate-intake/domain/models";
import type { CandidateColumnFilters } from "@/modules/candidate-intake/domain/column-filters";
import type { EmployeeDataOverview } from "@/modules/employee-data/domain/models";
import type { EmployeeDirectoryPage, EmployeeProfile } from "@/modules/employee-data/domain/models";
import type { EmployeeResumeDraft } from "@/modules/employee-data/domain/resume-import";
import type { ImportActionState } from "@/modules/employee-data/presentation/contracts";
import type { EmployeeWorkbookPreview } from "@/modules/employee-data/application/import-employee-workbook";
import type { RunMatchingResult } from "@/modules/matching/application/run-matching";
import type { MatchRun } from "@/modules/matching/domain/models";
import type { ParseCandidateQueryResult } from "@/modules/resume-parser/application/parse-candidate-query";
import type { CandidateProfile } from "@/modules/resume-parser/domain/models";
import type { AiStatus, ChatMessage } from "@/modules/enterprise-ai/domain/models";
import type { BatchEvent } from "@/modules/candidate-batch/domain/models";

export type CandidateSubmissionResult =
  | {
      kind: "accepted";
      query: CandidateQuery;
      reused?: boolean;
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
  importCandidateWorkbook(file: File, matchAfterImport: boolean, onEvent: (event: BatchEvent) => void, signal?: AbortSignal) {
    const form = new FormData();
    form.set("workbook", file);
    form.set("matchAfterImport", String(matchAfterImport));
    return readBatchStream("/api/candidate-batch/workbook", { method: "POST", body: form, signal }, onEvent);
  },
  aiStatus(): Promise<AiStatus> { return request("/api/enterprise-ai/status"); },
  askAi(messages: ChatMessage[], signal?: AbortSignal): Promise<ChatMessage> {
    return request("/api/enterprise-ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages }), signal });
  },
  importCandidates(files: File[], matchAfterImport: boolean, onEvent: (event: BatchEvent) => void, signal?: AbortSignal) {
    const form = new FormData();
    files.forEach((file) => form.append("resumeFiles", file));
    form.set("matchAfterImport", String(matchAfterImport));
    return readBatchStream("/api/candidate-batch/import", { method: "POST", body: form, signal }, onEvent);
  },
  matchCandidates(queryIds: string[], onEvent: (event: BatchEvent) => void, signal?: AbortSignal) {
    return readBatchStream("/api/candidate-batch/match", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queryIds }), signal }, onEvent);
  },
  candidates(page = 1, search = "", resultsOnly = false, matchCategory?: CandidateMatchCategory, filters?: CandidateColumnFilters): Promise<CandidateQueryPage> {
    const params = new URLSearchParams({ page: String(page), search, resultsOnly: resultsOnly ? "1" : "0" });
    if (matchCategory) params.set("matchCategory", matchCategory);
    if (filters && Object.values(filters).some(value => value !== undefined)) params.set("filters", JSON.stringify(filters));
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

  deleteEmployees(versionId: string, employeeIds: string[] | null): Promise<{ version: EmployeeDataOverview["activeVersion"] }> {
    return request("/api/admin/employee-data/employees/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(employeeIds ? { versionId, employeeIds } : { versionId, all: true }) });
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

  previewEmployeeWorkbook(file: File): Promise<EmployeeWorkbookPreview> {
    const form = new FormData();
    form.set("employeeFile", file);
    return request("/api/admin/employee-data/workbook-preview", { method: "POST", body: form });
  },

  previewEmployeeResume(file: File): Promise<{ kind: "parsed"; draft: EmployeeResumeDraft } | { kind: "rejected"; message: string }> {
    const form = new FormData();
    form.set("employeeFile", file);
    return request("/api/admin/employee-data/resume-preview", { method: "POST", body: form });
  },

  importEmployeeResume(draft: EmployeeResumeDraft): Promise<ImportActionState> {
    return request("/api/admin/employee-data/resume", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
  },

  async importEmployeeResumes(drafts: EmployeeResumeDraft[]): Promise<ImportActionState> {
    try {
      return await request("/api/admin/employee-data/resumes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(drafts) });
    } catch (error) {
      // These responses are emitted before publishing starts. Convert them to
      // per-batch validation failures so the importer can isolate a bad file.
      // Network errors, authentication failures and server errors remain fatal:
      // the client cannot know whether the batch was committed.
      if (error instanceof ApiError && (error.status === 400 || error.status === 413)) {
        const message = error.status === 413 ? "简历资料过大，请核对该文件。" : "员工资料字段或经历格式无效，请核对该文件。";
        return { status: "error", message, issues: [{ sheet: "简历", row: 0, field: "资料", code: "INVALID_REQUEST", message }], totalIssueCount: 1, version: null };
      }
      throw error;
    }
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

async function readBatchStream(url: string, options: RequestInit, onEvent: (event: BatchEvent) => void): Promise<void> {
  const response = await fetch(url, { credentials: "same-origin", ...options });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new ApiError(response.status, payload?.error ?? "批量处理请求失败，请重试。");
  }
  if (!response.body) throw new Error("无法读取处理进度，请检查候选人库。");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  try {
    while (true) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        const event = JSON.parse(line) as BatchEvent;
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "done") finished = true;
        onEvent(event);
      }
      if (chunk.done) break;
    }
    if (!finished) throw new Error("连接中断，已保存的候选人可在简历库查看；请勿重复导入。");
  } finally { reader.releaseLock(); }
}
