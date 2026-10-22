import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";

const directory = mkdtempSync(path.join(tmpdir(), "cf-library-"));
process.env.CONNECTION_FINDER_DB_PATH = path.join(directory, "test.sqlite");

try {
  const { employeeDataApplication: employees } = await import("../src/modules/employee-data/composition");
  const { publishEmployeeData } = await import("../src/modules/employee-data/infrastructure/sqlite/repository");
  const { candidateIntakeApplication: candidates } = await import("../src/modules/candidate-intake/composition");
  const { createCandidateQuery } = await import("../src/modules/candidate-intake/infrastructure/sqlite/repository");
  const { resumeParserApplication: parser } = await import("../src/modules/resume-parser/composition");
  const { matchingApplication: matching } = await import("../src/modules/matching/composition");

  assert.equal(employees.list({}).total, 0);
  assert.equal(candidates.list("owner", {}).total, 0);
  assert.equal(candidates.list("owner", { resultsOnly: true }).total, 0);
  const actor = { id: "owner", displayName: "测试" };
  const version = publishEmployeeData({
    employees: Array.from({ length: 25 }, (_, index) => ({ employeeId: `E-${String(index).padStart(2, "0")}`, name: `测试员工${index}`, email: `employee${index}@example.com`, currentDepartment: "产品部", currentTitle: "产品经理" })),
    workExperiences: [{ employeeId: "E-00", company: "腾讯", title: "产品经理", startDate: "2020-01-01", endDate: "2024-12-31" }],
    educationExperiences: [{ employeeId: "E-00", school: "北京大学", major: "计算机科学", startDate: "2016-09-01", endDate: "2020-06-30" }],
  }, actor);
  assert.equal(employees.list({}).items.length, 20);
  assert.equal(employees.list({ page: 2 }).items.length, 5);
  assert.equal(employees.list({ search: "employee0@" }).total, 1);
  assert.equal(employees.getProfile("E-00", version.id)?.workExperiences.length, 1);
  assert.equal(employees.getProfile("E-00", version.id)?.educations.length, 1);
  assert.equal(employees.getProfile("missing", version.id), null);
  assert.equal(employees.getProfile("E-00", "wrong-version"), null);

  const text = ["姓名：测试候选人", "工作经历", "公司：腾讯", "职位：产品经理", "任职时间：2021-01 至 2023-12", "教育经历", "学校：北京大学", "专业：计算机科学", "就读时间：2016-09 至 2020-06"].join("\n");
  const submitted = [];
  for (let index = 0; index < 21; index++) {
    const result = await candidates.submit({ actor, file: null, text: index === 0 ? text : text.replace("测试候选人", `测试候选人${index}`) });
    if (result.kind !== "accepted") throw new Error(JSON.stringify(result));
    submitted.push(result.query);
  }
  const foreign = await candidates.submit({ actor: { id: "other", displayName: "其他人" }, file: null, text });
  assert.equal(foreign.kind, "accepted");
  if (foreign.kind === "accepted") {
    assert.equal(foreign.query.id, submitted[0].id);
    assert.equal(foreign.query.submittedBy, actor.id);
    assert.equal(foreign.reused, true);
  }
  createCandidateQuery({ ...submitted[0], id: "expired", expiresAt: "2000-01-01T00:00:00.000Z" }, { sourceType: "TEXT", sourceFormat: "plain-text", text }, actor);
  assert.equal(candidates.list(actor.id, {}).total, 21);
  assert.equal(candidates.list(actor.id, {}).items.length, 20);
  assert.equal(candidates.list(actor.id, { page: 2 }).items.length, 1);
  assert.equal(candidates.list(actor.id, { page: -1 }).page, 1);
  assert.equal(candidates.getQuery(submitted[0].id, "other")?.id, submitted[0].id);
  assert.equal(candidates.getQuery("expired", actor.id), null);
  const parsed = await parser.parse(submitted[0].id, actor.id);
  assert.equal(parsed.kind, "profile");
  const match = matching.run(submitted[0].id, actor.id);
  assert.equal(match.kind, "matched");
  if (match.kind === "matched") assert.ok(match.run.resultCount > 0);
  assert.equal(candidates.list(actor.id, { search: "测试候选人" }).total, 21, "候选人搜索也应覆盖尚未解析的文本来源资料");
  assert.equal(candidates.list(actor.id, { search: "%" }).total, 0);
  assert.equal(candidates.list(actor.id, { resultsOnly: true }).total, 1);
  assert.equal(candidates.list("other", { resultsOnly: true }).total, 1);
  assert.equal((await parser.getPreview(submitted[0].id, actor.id))?.text, text);
  assert.equal((await parser.getPreview(submitted[0].id, "other"))?.text, text);
  assert.equal(await parser.getPreview("expired", actor.id), null);
  assert.equal(matching.getRun(submitted[0].id, actor.id)?.queryId, submitted[0].id);
  assert.equal(matching.getRun(submitted[0].id, "other")?.queryId, submitted[0].id);
  assert.equal(candidates.list(actor.id, { resultsOnly: true }).items[0].matching?.resultCount, match.kind === "matched" ? match.run.resultCount : -1);
  assert.equal((await parser.parse(submitted[0].id, actor.id)).kind, "profile");
  assert.equal(matching.getRun(submitted[0].id, actor.id), null);
  assert.equal(candidates.list(actor.id, { resultsOnly: true }).total, 0);
  assert.equal(matching.run(submitted[0].id, actor.id).kind, "matched");
  assert.equal(candidates.list(actor.id, { resultsOnly: true }).total, 1);
  for (const query of submitted.slice(1)) {
    assert.equal((await parser.parse(query.id, actor.id)).kind, "profile");
    assert.equal(matching.run(query.id, actor.id).kind, "matched");
  }
  const unmatched = await candidates.submit({ actor, file: null, text: text.replace("测试候选人", "无关联候选人").replace("腾讯", "无关联药企").replace("北京大学", "无关联大学") });
  assert.equal(unmatched.kind, "accepted");
  if (unmatched.kind !== "accepted") throw new Error("Expected unmatched fixture");
  await parser.parse(unmatched.query.id, actor.id);
  const noMatch = matching.run(unmatched.query.id, actor.id);
  assert.equal(noMatch.kind, "matched");
  if (noMatch.kind === "matched") assert.equal(noMatch.run.status, "NO_RESULTS");
  const insufficient = await candidates.submit({ actor, file: null, text: "姓名：信息不足候选人\n工作经历\n职位：研究员", textOrigin: "WORKBOOK_ROW" });
  assert.equal(insufficient.kind, "accepted");
  if (insufficient.kind !== "accepted") throw new Error("Expected insufficient fixture");
  await parser.parse(insufficient.query.id, actor.id);
  const skipped = matching.run(insufficient.query.id, actor.id);
  assert.equal(skipped.kind, "matched");
  if (skipped.kind === "matched") assert.equal(skipped.run.status, "SKIPPED_INSUFFICIENT");
  assert.equal((await candidates.submit({ actor, file: null, text: text.replace("测试候选人", "尚未处理候选人") })).kind, "accepted");

  const found = candidates.list(actor.id, { resultsOnly: true, matchCategory: "FOUND" });
  assert.equal(found.total, 21);
  assert.equal(found.items.length, 20);
  assert.deepEqual(found.resultCounts, { found: 21, notFound: 2 });
  assert.ok(found.items.every(item => item.matching?.status === "COMPLETED" && item.matching.resultCount > 0));
  const secondPage = candidates.list(actor.id, { page: 2, resultsOnly: true, matchCategory: "FOUND" });
  assert.equal(secondPage.items.length, 1);
  assert.deepEqual(secondPage.resultCounts, found.resultCounts, "分类数量必须是全部符合搜索条件的记录，而非当前页数量");
  const notFound = candidates.list(actor.id, { resultsOnly: true, matchCategory: "NOT_FOUND" });
  assert.equal(notFound.total, 2);
  assert.deepEqual(new Set(notFound.items.map(item => item.matching?.status)), new Set(["NO_RESULTS", "SKIPPED_INSUFFICIENT"]));
  assert.deepEqual(notFound.resultCounts, found.resultCounts);
  assert.equal(candidates.list(actor.id, { resultsOnly: true }).total, 23);
  assert.equal(candidates.list(actor.id, { resultsOnly: true, matchCategory: "invalid" }).total, 23);
  assert.equal(candidates.list(actor.id, { matchCategory: "FOUND" }).total, 24, "候选人库不应用结果分类，也应保留尚未处理的记录");
  assert.deepEqual(candidates.list(actor.id, { resultsOnly: true, search: "无关联" }).resultCounts, { found: 0, notFound: 1 });
  assert.equal(candidates.list(actor.id, { resultsOnly: true, matchCategory: "FOUND", search: "无关联" }).total, 0);
  assert.deepEqual(candidates.list("other", { resultsOnly: true }).resultCounts, { found: 21, notFound: 2 });
  await parser.parse(submitted[0].id, actor.id);
  assert.deepEqual(candidates.list(actor.id, { resultsOnly: true }).resultCounts, { found: 20, notFound: 2 }, "重解析后的无匹配运行记录不应归入任一结果分类");
  assert.equal(matching.run(submitted[0].id, actor.id).kind, "matched");
  assert.deepEqual(candidates.list(actor.id, { resultsOnly: true }).resultCounts, { found: 21, notFound: 2 });

  const { handleApi } = await import("../server/api");
  const { createSessionCookie } = await import("../src/modules/auth/composition");
  const cookie = (await createSessionCookie({ ...actor, name: "owner", role: "HR_USER" })).split(";")[0];
  const server = createServer((request, response) => {
    void handleApi(request, response).catch(() => response.writeHead(500).end());
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/candidate-intake/queries`;
    assert.equal((await fetch(`${base}?resultsOnly=1&matchCategory=FOUND`)).status, 401);
    for (const [category, expectedTotal] of [["FOUND", 21], ["NOT_FOUND", 2]] as const) {
      const response = await fetch(`${base}?resultsOnly=1&matchCategory=${category}`, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.total, expectedTotal);
      assert.deepEqual(body.resultCounts, { found: 21, notFound: 2 });
      assert.ok(body.items.every((item: { matching: { resultCount: number } }) => category === "FOUND" ? item.matching.resultCount > 0 : item.matching.resultCount === 0));
    }
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
  console.log("Library verification passed: result categories across pages, counts, search, insufficient data, HTTP, previews, shared history, deduplication and expiry");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
