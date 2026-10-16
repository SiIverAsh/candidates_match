import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
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
} finally {
  rmSync(directory, { recursive: true, force: true });
}
console.log("Intake without employees and legacy migration verification passed");
