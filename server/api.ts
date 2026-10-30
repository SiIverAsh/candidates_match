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
import { EmployeeImportConflict } from "../src/modules/employee-data/domain/resume-import";
import { employeeResumeDraftSchema, employeeResumesSchema, deleteEmployeesSchema } from "../src/modules/employee-data/presentation/contracts";
import { enterpriseAiApplication } from "../src/modules/enterprise-ai/composition";
import { chatRequestSchema } from "../src/modules/enterprise-ai/presentation/contracts";
import { AiError } from "../src/modules/enterprise-ai/domain/models";
import { candidateBatchApplication } from "../src/modules/candidate-batch/composition";
import { batchMatchSchema } from "../src/modules/candidate-batch/presentation/contracts";
import { BATCH_LIMITS, BatchInputError } from "../src/modules/candidate-batch/domain/models";
import type { BatchCommand } from "../src/modules/candidate-batch/application/process-batch";
import { CANDIDATE_WORKBOOK_LIMITS } from "../src/modules/candidate-batch/domain/workbook";
import { MAX_RESUME_FILE_BYTES } from "../src/shared/domain/import-file";
import { candidateColumnFiltersSchema } from "../src/modules/candidate-intake/presentation/contracts";

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

async function readBody(request: IncomingMessage, limit = maxRequestBytes): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buffer.length;
    if (total > limit) throw new RequestBodyError();
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export class RequestBodyError extends Error {
  constructor() { super("REQUEST_TOO_LARGE"); }
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
      warnings: result.warnings,
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

  if (url.pathname.startsWith("/api/enterprise-ai/") || url.pathname.startsWith("/api/candidate-batch/")) {
    if (!hasPermission(user, "candidate:query")) {
      auditDeniedAccess(user.id, "ASSISTANT_OR_BATCH", "FORBIDDEN");
      sendJson(response, 403, { error: "FORBIDDEN" });
      return true;
    }
    if (request.method === "GET" && url.pathname === "/api/enterprise-ai/status") {
      sendJson(response, 200, enterpriseAiApplication.status());
      return true;
    }
    if (request.method === "POST" && url.pathname === "/api/enterprise-ai/chat") {
      const controller = new AbortController();
      const abort = () => controller.abort();
      response.once("close", abort);
      try {
        let json: unknown;
        try { json = JSON.parse((await readBody(request, 192 * 1024)).toString("utf8")); }
        catch (error) {
          if (error instanceof RequestBodyError) throw error;
          sendJson(response, 400, { error: "请求格式无效。" });
          return true;
        }
        const parsed = chatRequestSchema.safeParse(json);
        if (!parsed.success) { sendJson(response, 400, { error: "对话过长或格式无效，请缩短消息或清空对话后重试。" }); return true; }
        sendJson(response, 200, await enterpriseAiApplication.ask(user.id, parsed.data.messages, controller.signal));
      } catch (error) {
        if (error instanceof RequestBodyError) sendJson(response, 413, { error: "消息太长，请缩短后重试。" });
        else if (error instanceof AiError) sendJson(response, error.status, { error: error.message, code: error.code });
        else throw error;
      } finally { response.off("close", abort); }
      return true;
    }
    if (request.method === "GET" && url.pathname === "/api/candidate-batch/template") {
      const template = await readFile(path.join(rootDirectory, "assets/templates/candidate_import_template.xlsx"));
      response.writeHead(200, { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="candidate_import_template.xlsx"', "Cache-Control": "private, no-store" });
      response.end(template);
      return true;
    }
    if (request.method === "POST" && ["/api/candidate-batch/import", "/api/candidate-batch/workbook", "/api/candidate-batch/match"].includes(url.pathname)) {
      const isWorkbook = url.pathname.endsWith("/workbook");
      const controller = new AbortController();
      const abort = () => controller.abort();
      response.once("close", abort);
      try {
        let command: BatchCommand;
        if (url.pathname.endsWith("/import") || isWorkbook) {
          const body = await readBody(request, (isWorkbook ? CANDIDATE_WORKBOOK_LIMITS.maxBytes : BATCH_LIMITS.maxTotalBytes) + 1024 * 1024);
          let form: FormData;
          try { form = await new Request(url, { method: "POST", headers: requestHeaders(request), body: new Uint8Array(body) }).formData(); }
          catch { throw new BatchInputError("上传格式无效，请重新选择简历文件。"); }
          const uploads = form.getAll(isWorkbook ? "workbook" : "resumeFiles");
          if (uploads.some((file) => typeof file === "string")) throw new BatchInputError("请选择有效的简历文件。");
          const matchAfterImport = form.get("matchAfterImport");
          if (matchAfterImport !== "true" && matchAfterImport !== "false") throw new BatchInputError("请选择导入后的处理方式。");
          if (isWorkbook) {
            if (uploads.length !== 1) throw new BatchInputError("请选择一份候选人 Excel 文件。");
            const rows = await candidateBatchApplication.prepareWorkbook(uploads[0] as File);
            command = { kind: "workbook", rows, matchAfterImport: matchAfterImport === "true" };
          } else command = { kind: "import", files: uploads as File[], matchAfterImport: matchAfterImport === "true" };
        } else {
          let json: unknown;
          try { json = JSON.parse((await readBody(request, 32 * 1024)).toString("utf8")); }
          catch (error) {
            if (error instanceof RequestBodyError) throw error;
            throw new BatchInputError("批量匹配请求格式无效。");
          }
          const parsed = batchMatchSchema.safeParse(json);
          if (!parsed.success) throw new BatchInputError("请选择 1～200 位候选人。");
          command = { kind: "match", queryIds: parsed.data.queryIds };
        }
        candidateBatchApplication.validate(command);
        response.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "private, no-store", "X-Accel-Buffering": "no" });
        for await (const event of candidateBatchApplication.process(command, { id: user.id, displayName: user.displayName }, controller.signal)) {
          if (response.destroyed) break;
          response.write(`${JSON.stringify(event)}\n`);
        }
        response.end();
      } catch (error) {
        if (response.headersSent) {
          if (!response.destroyed) response.end(`${JSON.stringify({ type: "error", message: "批次中断，已保存的候选人可在简历库查看，请勿重复导入。" })}\n`);
        } else if (error instanceof RequestBodyError) sendJson(response, 413, { error: isWorkbook ? "Excel 文件不能超过 10 MB。" : "上传总大小超限，每批最多 25 MB。" });
        else if (error instanceof BatchInputError) sendJson(response, 400, { error: error.message });
        else throw error;
      } finally { response.off("close", abort); }
      return true;
    }
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
    let columnFilters: unknown;
    try { columnFilters = JSON.parse(url.searchParams.get("filters") ?? "{}"); }
    catch { sendJson(response, 400, { error: "列筛选条件无效，请清除筛选后重试。" }); return true; }
    const parsedFilters = candidateColumnFiltersSchema.safeParse(columnFilters);
    if (!parsedFilters.success) { sendJson(response, 400, { error: "列筛选条件无效，请检查选项和日期范围。" }); return true; }
    sendJson(response, 200, await candidateIntakeApplication.browse(user.id, {
      page: Number(url.searchParams.get("page") ?? 1), search: url.searchParams.get("search") ?? "",
      resultsOnly: url.searchParams.get("resultsOnly") === "1",
      matchCategory: url.searchParams.get("matchCategory") ?? undefined,
      filters: parsedFilters.data,
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
    const profile = query ? await resumeParserApplication.ensureFunctions(queryId, user.id) : null;
    const run = query ? matchingApplication.getRun(queryId, user.id) : null;
    if (run) auditApplication.record({ actorId: user.id, actionType: "MATCH_RESULT_ACCESSED", resourceRef: queryId, outcome: "FOUND" });
    sendJson(response, query ? 200 : 404, query ? {
      query, profile, run,
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
    const body = await readBody(request, MAX_RESUME_FILE_BYTES + 1024 * 1024);
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
      const parsing = await resumeParserApplication.ensureProfile(result.query.id, user.id);
      sendJson(response, 200, { ...result, parsing, matching: null });
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
    const profile = await resumeParserApplication.ensureFunctions(
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
    const queryId = decodeURIComponent(matchingRunRoute[1]);
    await resumeParserApplication.ensureFunctions(queryId, user.id);
    const result = matchingApplication.run(queryId, user.id);
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
    await resumeParserApplication.ensureFunctions(queryId, user.id);
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

  if (request.method === "POST" && url.pathname === "/api/admin/employee-data/employees/delete") {
    let json: unknown;
    try { json = JSON.parse((await readBody(request, 32 * 1024 * 1024)).toString("utf8")); }
    catch (error) { if (error instanceof RequestBodyError) throw error; sendJson(response, 400, { error: "删除请求格式无效。" }); return true; }
    const parsed = deleteEmployeesSchema.safeParse(json);
    if (!parsed.success) { sendJson(response, 400, { error: "请选择有效的员工记录。" }); return true; }
    try {
      const version = employeeDataApplication.deleteEmployees(parsed.data.versionId, "all" in parsed.data ? null : parsed.data.employeeIds, { id: user.id, displayName: user.displayName });
      sendJson(response, 200, { version });
    } catch (error) {
      if (error instanceof EmployeeImportConflict) sendJson(response, 409, { error: error.message });
      else throw error;
    }
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/employee-data/resumes") {
    let json: unknown;
    try { json = JSON.parse((await readBody(request, 32 * 1024 * 1024)).toString("utf8")); }
    catch (error) { if (error instanceof RequestBodyError) throw error; sendJson(response, 400, { error: "员工资料格式无效。" }); return true; }
    const parsed = employeeResumesSchema.safeParse(json);
    if (!parsed.success) { sendJson(response, 400, { error: "员工资料字段或经历格式无效。" }); return true; }
    sendJson(response, 200, importState(employeeDataApplication.importResumes(parsed.data, { id: user.id, displayName: user.displayName })));
    return true;
  }

  const employeeProfileRoute = url.pathname.match(/^\/api\/admin\/employee-data\/employees\/([^/]+)$/u);
  if (request.method === "GET" && employeeProfileRoute) {
    const profile = employeeDataApplication.getProfile(decodeURIComponent(employeeProfileRoute[1]), url.searchParams.get("versionId") ?? "");
    sendJson(response, profile ? 200 : 404, profile ? { profile } : { error: "NOT_FOUND" });
    return true;
  }

  if (request.method === "POST" && (url.pathname === "/api/admin/employee-data" || url.pathname === "/api/admin/employee-data/workbook-preview")) {
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
    if (url.pathname === "/api/admin/employee-data/workbook-preview") {
      sendJson(response, 200, await employeeDataApplication.previewWorkbook(file));
      return true;
    }
    const result = await employeeDataApplication.importWorkbook({
      actor: { id: user.id, displayName: user.displayName },
      file: file
        ? { name: file.name, size: file.size, arrayBuffer: () => file.arrayBuffer() }
        : null,
    });
    sendJson(response, 200, importState(result));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/employee-data/resume-preview") {
    const body = await readBody(request, MAX_RESUME_FILE_BYTES + 1024 * 1024);
    const form = await new Request(url, { method: "POST", headers: requestHeaders(request), body: body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer }).formData();
    const file = form.get("employeeFile");
    if (!(file instanceof File)) {
      sendJson(response, 400, { error: "请选择一份员工简历。" });
      return true;
    }
    sendJson(response, 200, await employeeDataApplication.previewResume(file));
    return true;
  }

  if (request.method === "POST" && url.pathname === "/api/admin/employee-data/resume") {
    let json: unknown;
    try { json = JSON.parse((await readBody(request, 2 * 1024 * 1024)).toString("utf8")); }
    catch (error) {
      if (error instanceof RequestBodyError) throw error;
      sendJson(response, 400, { error: "员工资料格式无效。" });
      return true;
    }
    const parsed = employeeResumeDraftSchema.safeParse(json);
    if (!parsed.success) {
      sendJson(response, 400, { error: "员工资料字段或经历格式无效。" });
      return true;
    }
    const result = employeeDataApplication.importResume(parsed.data, { id: user.id, displayName: user.displayName });
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

