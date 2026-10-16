import type { IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { hasPermission } from "../src/modules/auth/domain/permissions";
import { auditApplication } from "../src/modules/audit/composition";
import {
  authenticateTestUser,
  clearSessionCookie,
  createSessionCookie,
  getUserFromCookieHeader,
} from "../src/modules/auth/composition";
import { candidateIntakeApplication } from "../src/modules/candidate-intake/composition";
import { employeeDataApplication } from "../src/modules/employee-data/composition";
import { matchingApplication } from "../src/modules/matching/composition";
import { resumeParserApplication } from "../src/modules/resume-parser/composition";
import type { ImportEmployeeWorkbookResult } from "../src/modules/employee-data/application/import-employee-workbook";
import type { ImportActionState } from "../src/modules/employee-data/presentation/contracts";

const rootDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const maxRequestBytes = 12 * 1024 * 1024;

function auditDeniedAccess(actorId: string, resourceRef: string, outcome: string): void {
  auditApplication.record({
    actorId,
    actionType: "ACCESS_DENIED",
    resourceRef,
    outcome,
  });
}

export function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, {
    "Cache-Control": "private, no-store",
    "Content-Type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(value));
}

async function readBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > maxRequestBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function requestHeaders(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function currentUser(request: IncomingMessage) {
  return getUserFromCookieHeader(request.headers.cookie);
}

function importState(result: ImportEmployeeWorkbookResult): ImportActionState {
  if (result.kind === "published") {
    return {
      status: "success",
      message: "导入成功，新数据版本已原子发布。",
      issues: [],
      totalIssueCount: 0,
      version: result.version,
    };
  }
  if (result.kind === "validation_failed") {
    return {
      status: "error",
      message: "校验未通过，当前生效版本未发生变化。",
      issues: result.issues,
      totalIssueCount: result.totalIssueCount,
      version: null,
    };
  }
  if (result.kind === "publish_failed") {
    return {
      status: "error",
      message: "发布失败，上一成功版本仍然有效。",
      issues: [result.issue],
      totalIssueCount: 1,
      version: null,
    };
  }
  const message = result.code === "FILE_REQUIRED"
    ? "请选择要导入的 Excel 文件。"
    : result.code === "INVALID_FILE_TYPE"
      ? "文件类型不受支持。"
      : "文件超过大小限制。";
  return {
    status: "error",
    message,
    issues: [result.issue],
    totalIssueCount: 1,
    version: null,
  };
}

export async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<boolean> {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  if (!url.pathname.startsWith("/api/")) return false;

  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    let input: {
      name?: unknown;
      password?: unknown;
    };
    try {
      input = JSON.parse((await readBody(request)).toString("utf8")) as typeof input;
    } catch {
      auditApplication.record({
        actorId: "anonymous",
        actionType: "LOGIN",
        resourceRef: null,
        outcome: "INVALID_INPUT",
      });
      sendJson(response, 400, { error: "INVALID_INPUT" });
      return true;
    }
    if (typeof input.name !== "string" || typeof input.password !== "string") {
      auditApplication.record({
        actorId: "anonymous",
        actionType: "LOGIN",
        resourceRef: null,
        outcome: "INVALID_INPUT",
      });
      sendJson(response, 400, { error: "INVALID_INPUT" });
      return true;
    }
    const user = await authenticateTestUser({ name: input.name, password: input.password });
    if (!user) {
      auditApplication.record({
        actorId: "anonymous",
        actionType: "LOGIN",
        resourceRef: null,
        outcome: "DENIED",
      });
      sendJson(response, 401, { error: "INVALID_CREDENTIALS" });
      return true;
    }
    auditApplication.record({
      actorId: user.id,
      actionType: "LOGIN",
      resourceRef: null,
      outcome: "SUCCESS",
    });
    sendJson(response, 200, { user }, { "Set-Cookie": await createSessionCookie(user) });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    const user = await currentUser(request);
    if (user) {
      auditApplication.record({
        actorId: user.id,
        actionType: "LOGOUT",
        resourceRef: null,
        outcome: "SUCCESS",
      });
    }
    sendJson(response, 200, { ok: true }, { "Set-Cookie": clearSessionCookie() });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/auth/session") {
    const user = await currentUser(request);
    sendJson(response, user ? 200 : 401, { user });
    return true;
  }

  const user = await currentUser(request);
  if (!user) {
    auditDeniedAccess("anonymous", "PROTECTED_API", "UNAUTHENTICATED");
    sendJson(response, 401, { error: "UNAUTHENTICATED" });
    return true;
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/candidate-intake/readiness"
  ) {
    if (!hasPermission(user, "candidate:query")) {
      auditDeniedAccess(user.id, "CANDIDATE_READINESS", "FORBIDDEN");
      sendJson(response, 403, { error: "FORBIDDEN" });
      return true;
    }
    sendJson(response, 200, candidateIntakeApplication.getReadiness());
    return true;
  }

  if (
    request.method === "GET" && url.pathname === "/api/candidate-intake/queries"
  ) {
    if (!hasPermission(user, "candidate:query")) {
      auditDeniedAccess(user.id, "CANDIDATE_LIBRARY", "FORBIDDEN");
      sendJson(response, 403, { error: "FORBIDDEN" });
      return true;
    }
    sendJson(response, 200, candidateIntakeApplication.list(user.id, {
      page: Number(url.searchParams.get("page") ?? 1), search: url.searchParams.get("search") ?? "",
      resultsOnly: url.searchParams.get("resultsOnly") === "1",
    }));
    return true;
  }

  const candidateDetailRoute = url.pathname.match(/^\/api\/candidate-intake\/queries\/([^/]+)$/u);
  if (request.method === "GET" && candidateDetailRoute) {
    if (!hasPermission(user, "candidate:query")) {
      sendJson(response, 403, { error: "FORBIDDEN" });
      return true;
    }
    const queryId = decodeURIComponent(candidateDetailRoute[1]);
    const query = candidateIntakeApplication.getQuery(queryId, user.id);
    const run = query ? matchingApplication.getRun(queryId, user.id) : null;
    if (run) auditApplication.record({ actorId: user.id, actionType: "MATCH_RESULT_ACCESSED", resourceRef: queryId, outcome: "FOUND" });
    sendJson(response, query ? 200 : 404, query ? {
      query, profile: resumeParserApplication.getProfile(queryId, user.id), run,
    } : { error: "NOT_FOUND" });
    return true;
  }

  const previewRoute = url.pathname.match(/^\/api\/resume-parser\/queries\/([^/]+)\/preview$/u);
  if (request.method === "GET" && previewRoute) {
    if (!hasPermission(user, "candidate:query")) {
      sendJson(response, 403, { error: "FORBIDDEN" });
      return true;
    }
    const preview = await resumeParserApplication.getPreview(decodeURIComponent(previewRoute[1]), user.id);
    sendJson(response, preview ? 200 : 404, preview ?? { error: "NOT_FOUND" });
    return true;
  }

  if (
    request.method === "POST" &&
    url.pathname === "/api/candidate-intake/queries"
  ) {
    if (!hasPermission(user, "candidate:query")) {
      auditDeniedAccess(user.id, "CANDIDATE_QUERY", "FORBIDDEN");
      sendJson(response, 403, { error: "FORBIDDEN" });
      return true;
    }
    const body = await readBody(request);
    const requestBody = body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ) as ArrayBuffer;
    const webRequest = new Request(url, {
      method: "POST",
      headers: requestHeaders(request),
      body: requestBody,
    });
    const form = await webRequest.formData();
    const upload = form.get("resumeFile");
    const file = upload && typeof upload === "object" && "arrayBuffer" in upload
      ? upload as File
      : null;
    const text = form.get("resumeText");
    const result = await candidateIntakeApplication.submit({
      actor: { id: user.id, displayName: user.displayName },
      file: file
        ? {
            name: file.name,
            size: file.size,
            type: file.type,
            arrayBuffer: () => file.arrayBuffer(),
          }
        : null,
      text: typeof text === "string" ? text : null,
    });
    if (result.kind === "accepted") {
      const parsing = await resumeParserApplication.parse(result.query.id, user.id);
      const matching = parsing.kind === "profile" &&
        (parsing.profile.parseStatus === "COMPLETE" || parsing.profile.parseStatus === "PARTIAL")
        ? matchingApplication.run(result.query.id, user.id)
        : null;
      if (matching?.kind === "matched") {
        auditApplication.record({
          actorId: user.id,
          actionType: "MATCH_RESULT_ACCESSED",
          resourceRef: result.query.id,
          outcome: "GENERATED",
        });
      }
      sendJson(response, 200, { ...result, parsing, matching });
    } else {
      sendJson(response, 200, result);
    }
    return true;
  }

  const parseRoute = url.pathname.match(/^\/api\/resume-parser\/queries\/([^/]+)\/parse$/u);
  if (request.method === "POST" && parseRoute) {
    if (!hasPermission(user, "candidate:query")) {
      auditDeniedAccess(user.id, "CANDIDATE_PARSE", "FORBIDDEN");
      sendJson(response, 403, { error: "FORBIDDEN" });
      return true;
    }
    const result = await resumeParserApplication.parse(
      decodeURIComponent(parseRoute[1]),
      user.id,
    );
    sendJson(response, result.kind === "not_found" ? 404 : 200, result);
    return true;
  }

  const profileRoute = url.pathname.match(/^\/api\/resume-parser\/queries\/([^/]+)\/profile$/u);
  if (request.method === "GET" && profileRoute) {
    if (!hasPermission(user, "candidate:query")) {
      auditDeniedAccess(user.id, "CANDIDATE_PROFILE", "FORBIDDEN");
      sendJson(response, 403, { error: "FORBIDDEN" });
      return true;
    }
    const profile = resumeParserApplication.getProfile(
      decodeURIComponent(profileRoute[1]),
      user.id,
    );
    sendJson(response, profile ? 200 : 404, profile ? { profile } : { error: "NOT_FOUND" });
    return true;
  }

  const matchingRunRoute = url.pathname.match(/^\/api\/matching\/queries\/([^/]+)\/run$/u);
  if (request.method === "POST" && matchingRunRoute) {
    if (!hasPermission(user, "candidate:query")) {
      auditDeniedAccess(user.id, "MATCH_RUN", "FORBIDDEN");
      sendJson(response, 403, { error: "FORBIDDEN" });
      return true;
    }
    const result = matchingApplication.run(
      decodeURIComponent(matchingRunRoute[1]),
      user.id,
    );
    sendJson(response, result.kind === "not_found" ? 404 : 200, result);
    return true;
  }

  const matchingResultRoute = url.pathname.match(/^\/api\/matching\/queries\/([^/]+)\/result$/u);
  if (request.method === "GET" && matchingResultRoute) {
    if (!hasPermission(user, "candidate:query")) {
      auditDeniedAccess(user.id, "MATCH_RESULT", "FORBIDDEN");
      sendJson(response, 403, { error: "FORBIDDEN" });
      return true;
    }
    const queryId = decodeURIComponent(matchingResultRoute[1]);
    const run = matchingApplication.getRun(
      queryId,
      user.id,
    );
    auditApplication.record({
      actorId: user.id,
      actionType: "MATCH_RESULT_ACCESSED",
      resourceRef: queryId,
      outcome: run ? "FOUND" : "NOT_FOUND",
    });
    sendJson(response, run ? 200 : 404, run ? { run } : { error: "NOT_FOUND" });
    return true;
  }

  const isEmployeeDataRoute =
    url.pathname === "/api/admin/access" ||
    url.pathname === "/api/admin/employee-data" ||
    url.pathname.startsWith("/api/admin/employee-data/");
  if (isEmployeeDataRoute && !hasPermission(user, "employee-data:import")) {
    auditDeniedAccess(user.id, "EMPLOYEE_DATA_ADMIN", "FORBIDDEN");
    sendJson(response, 403, { error: "FORBIDDEN" });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/access") {
    sendJson(response, 200, { allowed: true, user });
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/employee-data") {
    sendJson(response, 200, employeeDataApplication.getOverview());
    return true;
  }

  if (request.method === "GET" && url.pathname === "/api/admin/employee-data/employees") {
    sendJson(response, 200, employeeDataApplication.list({ page: Number(url.searchParams.get("page") ?? 1), search: url.searchParams.get("search") ?? "" }));
    return true;
  }

  const employeeProfileRoute = url.pathname.match(/^\/api\/admin\/employee-data\/employees\/([^/]+)$/u);
  if (request.method === "GET" && employeeProfileRoute) {
    const profile = employeeDataApplication.getProfile(decodeURIComponent(employeeProfileRoute[1]), url.searchParams.get("versionId") ?? "");
    sendJson(response, profile ? 200 : 404, profile ? { profile } : { error: "NOT_FOUND" });
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/employee-data") {
    const body = await readBody(request);
    const requestBody = body.buffer.slice(
      body.byteOffset,
      body.byteOffset + body.byteLength,
    ) as ArrayBuffer;
    const webRequest = new Request(url, {
      method: "POST",
      headers: requestHeaders(request),
      body: requestBody,
    });
    const form = await webRequest.formData();
    const upload = form.get("employeeFile");
    const file = upload && typeof upload === "object" && "arrayBuffer" in upload
      ? upload as File
      : null;
    const result = await employeeDataApplication.importWorkbook({
      actor: { id: user.id, displayName: user.displayName },
      file: file
        ? { name: file.name, size: file.size, arrayBuffer: () => file.arrayBuffer() }
        : null,
    });
    sendJson(response, 200, importState(result));
    return true;
  }

  if (
    request.method === "GET" &&
    url.pathname === "/api/admin/employee-data/template"
  ) {
    const template = await readFile(
      path.join(rootDirectory, "assets", "templates", "employee_import_template.xlsx"),
    );
    auditApplication.record({
      actorId: user.id,
      actionType: "EMPLOYEE_TEMPLATE_DOWNLOADED",
      resourceRef: null,
      outcome: "SUCCESS",
    });
    response.writeHead(200, {
      "Cache-Control": "private, no-store",
      "Content-Disposition": 'attachment; filename="employee_import_template.xlsx"',
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    response.end(template);
    return true;
  }

  sendJson(response, 404, { error: "NOT_FOUND" });
  return true;
}

