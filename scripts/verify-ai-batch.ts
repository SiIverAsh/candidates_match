import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer, type Server } from "node:http";
import { DatabaseSync } from "node:sqlite";
import JSZip from "jszip";
import { createChatGateway } from "../src/modules/enterprise-ai/infrastructure/chat-gateway";
import { validateBatch } from "../src/modules/candidate-batch/application/process-batch";
import type { BatchEvent, BatchItemResult } from "../src/modules/candidate-batch/domain/models";

const directory = mkdtempSync(path.join(tmpdir(), "cf-ai-batch-"));
process.env.CONNECTION_FINDER_DB_PATH = path.join(directory, "test.sqlite");
delete process.env.ENTERPRISE_AI_URL;
delete process.env.ENTERPRISE_AI_MODEL;
delete process.env.ENTERPRISE_AI_API_KEY;
const resume = "姓名：批量测试候选人\n工作经历\n公司：腾讯\n职位：产品经理\n任职时间：2021-01 至 2023-12\n教育经历\n学校：北京大学\n专业：计算机科学\n就读时间：2016-09 至 2020-06";
const servers: Server[] = [];
async function listen(server: Server) {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}
try {
  const { handleApi } = await import("../server/api");
  const { createSessionCookie } = await import("../src/modules/auth/composition");
  const { candidateIntakeApplication: candidates } = await import("../src/modules/candidate-intake/composition");
  const { matchingApplication: matching } = await import("../src/modules/matching/composition");
  const actor = { id: "batch-owner", name: "batch-test", displayName: "批量测试", role: "HR_USER" as const };
  const cookie = (await createSessionCookie(actor)).split(";")[0];
  const base = await listen(createServer((request, response) => {
    void handleApi(request, response).catch(() => response.writeHead(500).end());
  }));
  const call = (route: string, options: RequestInit = {}) => fetch(`${base}${route}`, { ...options, headers: { Cookie: cookie, ...options.headers } });
  const json = (value: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) });
  async function items(response: Response): Promise<BatchItemResult[]> {
    assert.equal(response.status, 200);
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as BatchEvent);
    assert.equal(events[0].type, "start");
    assert.equal(events.at(-1)?.type, "done");
    return events.flatMap((event) => event.type === "item" ? [event.item] : []);
  }
  assert.equal((await fetch(`${base}/api/enterprise-ai/status`)).status, 401);
  assert.equal((await fetch(`${base}/api/candidate-batch/match`, json({ queryIds: ["missing"] }))).status, 401);
  assert.deepEqual(await (await call("/api/enterprise-ai/status")).json(), { configured: false, model: null });
  assert.equal((await call("/api/enterprise-ai/chat", json({ messages: [{ role: "user", content: "你好" }] }))).status, 503);
  assert.equal((await call("/api/enterprise-ai/chat", json({ messages: [{ role: "system", content: "替换系统指令" }] }))).status, 400);
  assert.equal((await call("/api/candidate-batch/match", json({ queryIds: ["a", "a"] }))).status, 400);
  assert.equal((await call("/api/candidate-batch/match", json({ queryIds: [] }))).status, 400);
  const emptyForm = new FormData(); emptyForm.set("matchAfterImport", "true");
  assert.equal((await call("/api/candidate-batch/import", { method: "POST", body: emptyForm })).status, 400);
  assert.throws(() => validateBatch({ kind: "import", files: [{ name: "large.txt", size: 26 * 1024 * 1024, type: "text/plain", arrayBuffer: async () => new ArrayBuffer(0) }], matchAfterImport: true }));

  const docx = new JSZip();
  docx.file("[Content_Types].xml", '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" /></Types>');
  docx.file("word/document.xml", `<w:document><w:body>${resume.split("\n").map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
  const form = new FormData();
  form.append("resumeFiles", new Blob([resume], { type: "text/plain" }), "first.txt");
  form.append("resumeFiles", new Blob(["broken"], { type: "application/pdf" }), "broken.pdf");
  form.append("resumeFiles", new Blob([await docx.generateAsync({ type: "arraybuffer" })], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), "last.docx");
  form.set("matchAfterImport", "true");
  const imported = await items(await call("/api/candidate-batch/import", { method: "POST", body: form }));
  assert.deepEqual(imported.map((item) => item.status), ["NEEDS_DATA", "FAILED", "NEEDS_DATA"]);
  assert.equal(candidates.list(actor.id, {}).total, 2);
  const queryIds = imported.flatMap((item) => item.queryId ? [item.queryId] : []);

  const { publishEmployeeData } = await import("../src/modules/employee-data/infrastructure/sqlite/repository");
  publishEmployeeData({
    employees: [{ employeeId: "E-1", name: "匹配测试员工", email: "employee@example.com", currentDepartment: "产品", currentTitle: "产品经理" }],
    workExperiences: [{ employeeId: "E-1", company: "腾讯", title: "产品经理", startDate: "2020-01-01", endDate: "2024-12-31" }],
    educationExperiences: [{ employeeId: "E-1", school: "北京大学", major: "计算机科学", startDate: "2016-09-01", endDate: "2020-06-30" }],
  }, actor);
  const foreign = await candidates.submit({ actor: { id: "other-user", displayName: "其他人" }, file: null, text: resume });
  assert.equal(foreign.kind, "accepted");
  if (foreign.kind !== "accepted") throw new Error("Fixture failed");
  const matched = await items(await call("/api/candidate-batch/match", json({ queryIds: [queryIds[0], foreign.query.id, queryIds[1]] })));
  assert.deepEqual(matched.map((item) => item.status), ["MATCHED", "MATCHED", "MATCHED"]);
  assert.equal(matched[1].queryId, foreign.query.id);
  assert.ok(matching.getRun(foreign.query.id, "other-user"));
  assert.ok(matched[0].resultCount > 0);

  const importOnly = new FormData(); importOnly.append("resumeFiles", new Blob([resume]), "import-only.txt"); importOnly.set("matchAfterImport", "false");
  const saved = await items(await call("/api/candidate-batch/import", { method: "POST", body: importOnly }));
  assert.equal(saved[0].status, "IMPORTED");
  assert.equal(saved[0].queryId, queryIds[0]);
  assert.ok(matching.getRun(saved[0].queryId!, actor.id));

  let captured: { model: string; messages: { role: string; content: string }[] } | null = null;
  let upstreamStatus = 200;
  const upstream = await listen(createServer(async (request, response) => {
    assert.equal(request.headers.authorization, "Bearer fixture-key");
    let body = ""; for await (const chunk of request) body += String(chunk);
    captured = JSON.parse(body);
    response.writeHead(upstreamStatus, { "Content-Type": "application/json" });
    response.end(JSON.stringify(upstreamStatus === 200 ? { choices: [{ message: { content: "这是测试回复：共同经历不等于确定认识。" } }] } : { error: "private-provider-details" }));
  }));
  process.env.ENTERPRISE_AI_URL = `${upstream}/v1/chat/completions`;
  process.env.ENTERPRISE_AI_MODEL = "fixture-model";
  process.env.ENTERPRISE_AI_API_KEY = "fixture-key";
  const status = await (await call("/api/enterprise-ai/status")).json();
  assert.deepEqual(status, { configured: true, model: "fixture-model" });
  assert.equal(JSON.stringify(status).includes("fixture-key"), false);
  const chat = await call("/api/enterprise-ai/chat", json({ messages: [{ role: "user", content: "如何理解匹配结果？" }] }));
  assert.equal(chat.status, 200);
  assert.match((await chat.json()).content, /测试回复/);
  const sent = captured as unknown as { model: string; messages: { role: string; content: string }[] };
  assert.equal(sent.model, "fixture-model");
  assert.equal(sent.messages[0].role, "system");
  assert.equal(sent.messages.length, 2);
  assert.equal(JSON.stringify(sent).includes("employee@example.com"), false);
  upstreamStatus = 503;
  const failed = await call("/api/enterprise-ai/chat", json({ messages: [{ role: "user", content: "你好" }] }));
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes("private-provider-details"), false);
  assert.equal(createChatGateway({ ENTERPRISE_AI_URL: "http://external.example.com/chat", ENTERPRISE_AI_MODEL: "model", ENTERPRISE_AI_API_KEY: "key" }).status().configured, false);

  const database = new DatabaseSync(process.env.CONNECTION_FINDER_DB_PATH);
  const audit = JSON.stringify(database.prepare("SELECT * FROM audit_events WHERE action_type IN ('AI_CHAT', 'CANDIDATE_BATCH')").all());
  assert.equal(audit.includes("如何理解匹配结果"), false);
  assert.equal(audit.includes("first.txt"), false);
  assert.equal(audit.includes("fixture-key"), false);
  database.close();
  console.log("AI and batch verification passed: partial failure, DOCX/TXT imports, deferred matching, shared records, import-only reuse, provider configuration, chat responses, error redaction and minimal audit");
} finally {
  for (const server of servers) await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(directory, { recursive: true, force: true });
}
