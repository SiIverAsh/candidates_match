import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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
    const result = await candidates.submit({ actor, file: null, text });
    if (result.kind !== "accepted") throw new Error(JSON.stringify(result));
    submitted.push(result.query);
  }
  const foreign = await candidates.submit({ actor: { id: "other", displayName: "其他人" }, file: null, text });
  assert.equal(foreign.kind, "accepted");
  createCandidateQuery({ ...submitted[0], id: "expired", expiresAt: "2000-01-01T00:00:00.000Z" }, { sourceType: "TEXT", sourceFormat: "plain-text", text }, actor);
  assert.equal(candidates.list(actor.id, {}).total, 21);
  assert.equal(candidates.list(actor.id, {}).items.length, 20);
  assert.equal(candidates.list(actor.id, { page: 2 }).items.length, 1);
  assert.equal(candidates.list(actor.id, { page: -1 }).page, 1);
  assert.equal(candidates.getQuery(submitted[0].id, "other"), null);
  assert.equal(candidates.getQuery("expired", actor.id), null);
  const parsed = await parser.parse(submitted[0].id, actor.id);
  assert.equal(parsed.kind, "profile");
  const match = matching.run(submitted[0].id, actor.id);
  assert.equal(match.kind, "matched");
  if (match.kind === "matched") assert.ok(match.run.resultCount > 0);
  assert.equal(candidates.list(actor.id, { search: "测试候选人" }).total, 1);
  assert.equal(candidates.list(actor.id, { search: "%" }).total, 0);
  assert.equal(candidates.list(actor.id, { resultsOnly: true }).total, 1);
  assert.equal(candidates.list("other", { resultsOnly: true }).total, 0);
  assert.equal((await parser.getPreview(submitted[0].id, actor.id))?.text, text);
  assert.equal(await parser.getPreview(submitted[0].id, "other"), null);
  assert.equal(await parser.getPreview("expired", actor.id), null);
  assert.equal(matching.getRun(submitted[0].id, actor.id)?.queryId, submitted[0].id);
  assert.equal(matching.getRun(submitted[0].id, "other"), null);
  assert.equal(candidates.list(actor.id, { resultsOnly: true }).items[0].matching?.resultCount, match.kind === "matched" ? match.run.resultCount : -1);
  assert.equal((await parser.parse(submitted[0].id, actor.id)).kind, "profile");
  assert.equal(matching.getRun(submitted[0].id, actor.id), null);
  assert.equal(candidates.list(actor.id, { resultsOnly: true }).total, 0);
  assert.equal(matching.run(submitted[0].id, actor.id).kind, "matched");
  assert.equal(candidates.list(actor.id, { resultsOnly: true }).total, 1);
  console.log("Library verification passed: pagination, search, previews, history, ownership and expiry");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
