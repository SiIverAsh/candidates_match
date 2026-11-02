import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(path.join(tmpdir(), "cf-manual-review-"));
process.env.CONNECTION_FINDER_DB_PATH = path.join(directory, "test.sqlite");

try {
  const { candidateIntakeApplication: candidates } = await import("../src/modules/candidate-intake/composition");
  const { employeeDataApplication } = await import("../src/modules/employee-data/composition");
  const { publishEmployeeData } = await import("../src/modules/employee-data/infrastructure/sqlite/repository");
  const { resumeParserApplication: parser } = await import("../src/modules/resume-parser/composition");
  const { matchingApplication: matching } = await import("../src/modules/matching/composition");
  const { assessCandidateReview } = await import("../src/modules/candidate-intake/domain/manual-review");
  const { saveCandidateReview } = await import("../src/modules/candidate-intake/infrastructure/sqlite/repository");
  const actor = { id: "recruiter-a", displayName: "测试招聘员甲" };
  const reviewer = { id: "recruiter-b", displayName: "测试招聘员乙" };
  employeeDataApplication.getOverview();
  assert.deepEqual(candidates.list(actor.id, { reviewStatus: "PENDING" }).reviewCounts, { pending: 0, reviewed: 0 }, "首次使用、尚无匹配表时应返回空队列");
  publishEmployeeData({
    employees: [{ employeeId: "E-1", name: "测试同事", email: "test@example.com", currentDepartment: "研发", currentTitle: "研究员" }],
    workExperiences: [{ employeeId: "E-1", company: "腾讯", title: "研究员", startDate: "2020-01-01", endDate: "2024-12-31" }],
    educationExperiences: [],
  }, actor);

  async function submit(name: string, company = "无关联公司", run = true) {
    const submitted = await candidates.submit({ actor, file: null, text: `姓名：${name}\n工作经历\n公司：${company}\n职位：产品经理\n任职时间：2021-01 至 2023-12`, textOrigin: "WORKBOOK_ROW" });
    if (submitted.kind !== "accepted") throw new Error(JSON.stringify(submitted));
    if (run) {
      assert.equal((await parser.parse(submitted.query.id, actor.id)).kind, "profile");
      assert.equal(matching.run(submitted.query.id, actor.id).kind, "matched");
    }
    return submitted.query;
  }
  const unmatched = [];
  for (let index = 0; index < 22; index++) unmatched.push(await submit(`无匹配候选人${index}`));
  const pending = await submit("尚未匹配候选人", "未执行公司", false);
  const low = await submit("低置信度但有人脉", "腾讯");
  const lowRun = matching.getRun(low.id, actor.id)!;
  assert.equal(lowRun.results[0].confidence, "LOW");
  assert.equal(candidates.getReview(low.id)?.status, "NONE", "只要匹配到人，即使职能或关系置信度低也不进入复核");
  assert.equal(candidates.getReview(pending.id)?.status, "NONE");

  const insufficient = await candidates.submit({ actor, file: null, text: "姓名：资料不足候选人\n工作经历\n职位：研究员", textOrigin: "WORKBOOK_ROW" });
  if (insufficient.kind !== "accepted") throw new Error(JSON.stringify(insufficient));
  await parser.parse(insufficient.query.id, actor.id);
  matching.run(insufficient.query.id, actor.id);
  assert.equal(candidates.getReview(insufficient.query.id)?.reason, "INSUFFICIENT");
  const firstPage = await candidates.browse(reviewer.id, { reviewStatus: "PENDING" });
  assert.equal(firstPage.total, 23);
  assert.equal(firstPage.items.length, 20);
  assert.deepEqual(firstPage.reviewCounts, { pending: 23, reviewed: 0 });
  assert.ok(firstPage.items.every(item => item.review.status === "PENDING" && item.matching?.resultCount === 0));
  assert.equal(candidates.list(actor.id, { page: 2, reviewStatus: "PENDING" }).items.length, 3);
  assert.equal(candidates.list(actor.id, { search: "资料不足", reviewStatus: "PENDING" }).total, 1);
  assert.equal(candidates.list(actor.id, { filters: { matchStatuses: ["INSUFFICIENT"] }, reviewStatus: "PENDING" }).total, 1);
  assert.equal(candidates.list(actor.id, { resultsOnly: true, matchCategory: "FOUND", reviewStatus: "PENDING" }).total, 0);

  const query = unmatched[0];
  const runId = candidates.getReview(query.id)!.runId!;
  const saved = candidates.review(query.id, runId, "REVIEWED", reviewer);
  assert.equal(saved.kind, "saved");
  assert.equal(candidates.getReview(query.id)?.decision?.reviewedBy, reviewer.id);
  assert.deepEqual(candidates.list(actor.id, { reviewStatus: "PENDING" }).reviewCounts, { pending: 22, reviewed: 1 });
  assert.equal(candidates.list(actor.id, { reviewStatus: "REVIEWED" }).items[0].id, query.id);
  candidates.review(query.id, runId, "REVIEWED", actor);
  assert.equal(candidates.getReview(query.id)?.decision?.reviewedBy, reviewer.id, "重复提交不覆盖首次复核人");
  saveCandidateReview(query.id, runId, { runId, reviewedBy: actor.id, reviewedByName: actor.displayName, reviewedAt: new Date().toISOString() }, actor, new Date().toISOString());
  assert.equal(candidates.getReview(query.id)?.decision?.reviewedBy, reviewer.id, "事务内应保留先提交的复核记录");
  assert.equal(matching.run(query.id, actor.id).kind, "matched");
  assert.equal(candidates.getReview(query.id)?.status, "REVIEWED", "复用同次匹配不应重新入队");
  candidates.review(query.id, runId, "PENDING", actor);
  assert.equal(candidates.getReview(query.id)?.status, "PENDING");
  candidates.review(query.id, runId, "REVIEWED", reviewer);
  await parser.parse(query.id, actor.id);
  assert.equal(candidates.getReview(query.id)?.status, "NONE", "重解析后尚未匹配时暂不入队");
  matching.run(query.id, actor.id);
  assert.equal(candidates.getReview(query.id)?.status, "PENDING", "新的零人匹配需要重新复核");
  assert.equal(candidates.review(query.id, runId, "REVIEWED", actor).kind, "conflict", "旧页面不能确认新的匹配运行");
  assert.equal(assessCandidateReview({ id: "new-successful-run", status: "COMPLETED", resultCount: 1 }, saved.kind === "saved" ? saved.review.decision : null).status, "NONE");

  const { handleApi } = await import("../server/api");
  const { createSessionCookie } = await import("../src/modules/auth/composition");
  const cookie = (await createSessionCookie({ ...reviewer, name: "reviewer", role: "HR_USER" })).split(";")[0];
  const server = createServer((request, response) => { void handleApi(request, response).catch(error => { console.error(error); response.writeHead(500).end(); }); });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const base = `http://127.0.0.1:${address.port}/api/candidate-intake/queries`;
    const headers = { Cookie: cookie, "Content-Type": "application/json" };
    const reviewUrl = `${base}/${query.id}/review`;
    const body = JSON.stringify({ runId: candidates.getReview(query.id)!.runId, status: "REVIEWED" });
    assert.equal((await fetch(`${base}?reviewStatus=PENDING`)).status, 401);
    assert.equal((await fetch(reviewUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body })).status, 401);
    assert.equal((await fetch(`${base}?reviewStatus=INVALID`, { headers })).status, 400);
    assert.equal((await fetch(reviewUrl, { method: "POST", headers, body: "{" })).status, 400);
    assert.equal((await fetch(reviewUrl, { method: "POST", headers, body: JSON.stringify({ runId, status: "invalid" }) })).status, 400);
    assert.equal((await fetch(`${base}/missing/review`, { method: "POST", headers, body })).status, 404);
    assert.equal((await fetch(`${base}/${low.id}/review`, { method: "POST", headers, body: JSON.stringify({ runId: lowRun.id, status: "REVIEWED" }) })).status, 409);
    assert.equal((await fetch(reviewUrl, { method: "POST", headers, body: JSON.stringify({ runId, status: "REVIEWED" }) })).status, 409);
    assert.equal((await fetch(reviewUrl, { method: "POST", headers, body })).status, 200);
    const reviewed = await (await fetch(`${base}?reviewStatus=REVIEWED`, { headers })).json();
    assert.equal(reviewed.total, 1);
    assert.equal(reviewed.items[0].review.decision.reviewedByName, reviewer.displayName);
    const detail = await (await fetch(`${base}/${query.id}`, { headers })).json();
    assert.equal(detail.review.status, "REVIEWED");
    assert.equal((await fetch(reviewUrl, { method: "POST", headers, body: JSON.stringify({ runId: detail.run.id, status: "PENDING" }) })).status, 200);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }

  const database = new DatabaseSync(process.env.CONNECTION_FINDER_DB_PATH);
  candidates.review(query.id, candidates.getReview(query.id)!.runId!, "REVIEWED", reviewer);
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM candidate_reviews WHERE query_id = ?").get(query.id)?.count, 1);
  database.prepare("UPDATE candidate_queries SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?").run(query.id);
  assert.equal(candidates.getReview(query.id), null);
  assert.equal(candidates.review(query.id, candidates.getReview(unmatched[1].id)!.runId!, "REVIEWED", actor).kind, "not_found");
  assert.equal(candidates.list(actor.id, { reviewStatus: "PENDING" }).total, 22);
  candidates.purgeExpired();
  assert.equal(database.prepare("SELECT COUNT(*) AS count FROM candidate_reviews WHERE query_id = ?").get(query.id)?.count, 0, "复核记录随过期资料清理");
  assert.ok(Number(database.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action_type = 'CANDIDATE_MANUAL_REVIEW'").get()?.count) > 0);
  database.close();
  console.log("Manual review verification passed: shared queue, zero-result rule, low-score exclusion, pagination/filtering, review/reopen, stale-result conflicts, HTTP authentication/validation and retention");
} finally { rmSync(directory, { recursive: true, force: true }); }
