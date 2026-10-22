import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { migrateOptionalEmployeeVersion } from "../src/modules/candidate-intake/infrastructure/sqlite/repository";

const legacy = new DatabaseSync(":memory:");
legacy.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE employee_data_versions (id TEXT PRIMARY KEY);
  INSERT INTO employee_data_versions VALUES ('v1');
  CREATE TABLE candidate_queries (id TEXT PRIMARY KEY, employee_version_id TEXT NOT NULL REFERENCES employee_data_versions(id));
  CREATE INDEX candidate_version ON candidate_queries(employee_version_id);
  INSERT INTO candidate_queries VALUES ('q1', 'v1');
  CREATE TABLE candidate_profiles (query_id TEXT REFERENCES candidate_queries(id) ON DELETE CASCADE);
  INSERT INTO candidate_profiles VALUES ('q1');
`);
migrateOptionalEmployeeVersion(legacy);
migrateOptionalEmployeeVersion(legacy);
assert.equal(legacy.prepare("SELECT COUNT(*) AS count FROM candidate_profiles").get()?.count, 1);
assert.equal(legacy.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE name = 'candidate_version'").get()?.count, 1);
legacy.prepare("INSERT INTO candidate_queries VALUES (?, ?)").run("q2", null);
assert.equal(legacy.prepare("PRAGMA foreign_key_check").all().length, 0);
legacy.exec("DELETE FROM candidate_queries WHERE id = 'q1'");
assert.equal(legacy.prepare("SELECT COUNT(*) AS count FROM candidate_profiles").get()?.count, 0);
legacy.close();

const directory = mkdtempSync(path.join(tmpdir(), "cf-intake-"));
process.env.CONNECTION_FINDER_DB_PATH = path.join(directory, "test.sqlite");
try {
  const { candidateIntakeApplication } = await import("../src/modules/candidate-intake/composition");
  const { resumeParserApplication } = await import("../src/modules/resume-parser/composition");
  const { matchingApplication } = await import("../src/modules/matching/composition");
  candidateIntakeApplication.list("test-user", {});
  resumeParserApplication.getProfile("missing-query", "test-user");
  assert.equal(matchingApplication.run("missing-query", "test-user").kind, "not_found");
  const result = await candidateIntakeApplication.submit({
    actor: { id: "test-user", displayName: "Test User" }, file: null,
    text: ["姓名：测试候选人", "工作经历", "公司：腾讯", "职位：产品经理", "任职时间：2021-01 至 2023-12", "教育经历", "学校：北京大学", "专业：计算机科学", "就读时间：2016-09 至 2020-06"].join("\n"),
  });
  assert.equal(result.kind, "accepted");
  if (result.kind !== "accepted") throw new Error(JSON.stringify(result));
  assert.equal(result.query.employeeVersionId, null);
  const parsed = await resumeParserApplication.parse(result.query.id, "test-user");
  assert.equal(parsed.kind, "profile");
  if (parsed.kind === "profile") assert.equal(parsed.profile.parseStatus, "COMPLETE");
  assert.equal(matchingApplication.run(result.query.id, "test-user").kind, "no_employee_version");

  const { publishEmployeeData } = await import("../src/modules/employee-data/infrastructure/sqlite/repository");
  const data = {
    employees: [{ employeeId: "E-1", name: "测试员工", email: "employee@example.com", currentDepartment: "产品部", currentTitle: "产品经理" }],
    workExperiences: [{ employeeId: "E-1", company: "腾讯", title: "产品经理", startDate: "2020-01-01", endDate: "2024-12-31" }],
    educationExperiences: [{ employeeId: "E-1", school: "北京大学", major: "计算机科学", startDate: "2016-09-01", endDate: "2020-06-30" }],
  };
  const actor = { id: "test-user", displayName: "Test User" };
  const version = publishEmployeeData(data, actor);
  const database = new DatabaseSync(process.env.CONNECTION_FINDER_DB_PATH);
  try {
    const boundVersion = () => database.prepare("SELECT employee_version_id FROM candidate_queries WHERE id = ?").get(result.query.id)?.employee_version_id;
    assert.equal(matchingApplication.run(result.query.id, "other-user").kind, "matched");
    assert.equal(matchingApplication.run("missing-query", actor.id).kind, "not_found");
    assert.equal(boundVersion(), null);

    for (const [table, key] of [["candidate_queries", "id"], ["candidate_profiles", "query_id"]]) {
      database.prepare(`UPDATE ${table} SET expires_at = ? WHERE ${key} = ?`).run("2000-01-01T00:00:00.000Z", result.query.id);
      assert.equal(matchingApplication.run(result.query.id, actor.id).kind, "not_found");
      assert.equal(boundVersion(), null);
      database.prepare(`UPDATE ${table} SET expires_at = ? WHERE ${key} = ?`).run(result.query.expiresAt, result.query.id);
    }

    const matched = matchingApplication.run(result.query.id, actor.id);
    assert.equal(matched.kind, "matched");
    if (matched.kind !== "matched") throw new Error(JSON.stringify(matched));
    assert.equal(matched.run.employeeVersionId, version.id);
    assert.ok(matched.run.resultCount > 0);
    assert.equal(boundVersion(), null);
    assert.equal(matchingApplication.getRun(result.query.id, actor.id)?.employeeVersionId, version.id);

    const { handleApi } = await import("../server/api");
    const { createSessionCookie } = await import("../src/modules/auth/composition");
    const server = createServer((request, response) => {
      void handleApi(request, response).catch((error) => {
        response.writeHead(500).end(String(error));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Expected TCP address");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const cookie = (await createSessionCookie({ ...actor, name: "test", role: "HR_ADMIN" })).split(";")[0];
      const form = new FormData();
      form.set("resumeText", "姓名：独立导入测试\n工作经历\n公司：腾讯\n职位：产品经理\n任职时间：2021-01 至 2023-12\n教育经历\n学校：北京大学\n专业：计算机科学\n就读时间：2016-09 至 2020-06");
      const response = await fetch(`${baseUrl}/api/candidate-intake/queries`, { method: "POST", headers: { Cookie: cookie }, body: form });
      assert.equal(response.status, 200);
      const imported = await response.json();
      assert.equal(imported.kind, "accepted", JSON.stringify(imported));
      assert.equal(imported.parsing.kind, "profile");
      assert.equal(imported.matching, null);
      assert.equal(matchingApplication.getRun(imported.query.id, actor.id), null);
      const matchResponse = await fetch(`${baseUrl}/api/matching/queries/${imported.query.id}/run`, { method: "POST", headers: { Cookie: cookie } });
      assert.equal(matchResponse.status, 200);
      assert.equal((await matchResponse.json()).kind, "matched");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }

    const nextVersion = publishEmployeeData(data, actor);
    assert.notEqual(nextVersion.id, version.id);
    assert.equal(matchingApplication.getRun(result.query.id, actor.id)?.employeeVersionId, version.id);
    // Repeated matching reuses the original version until the profile is explicitly regenerated.
    database.prepare("UPDATE candidate_queries SET employee_version_id = ? WHERE id = ?").run(version.id, result.query.id);
    const repeated = matchingApplication.run(result.query.id, actor.id);
    assert.equal(repeated.kind, "matched");
    if (repeated.kind === "matched") assert.equal(repeated.run.employeeVersionId, version.id);
    assert.equal(boundVersion(), version.id);
    publishEmployeeData({ employees: [], workExperiences: [], educationExperiences: [] }, actor);
    assert.equal(matchingApplication.run(result.query.id, actor.id).kind, "matched");
    await resumeParserApplication.parse(result.query.id, actor.id);
    assert.equal(matchingApplication.run(result.query.id, actor.id).kind, "no_employee_version");
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
  } finally {
    database.close();
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
console.log("Intake without employees and legacy migration verification passed");
