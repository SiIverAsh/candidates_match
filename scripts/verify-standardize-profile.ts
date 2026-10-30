import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import ExcelJS from "exceljs";

const run = promisify(execFile);
const temp = await mkdtemp(path.join(tmpdir(), "standardized-resume-test-"));
try {
  const source = path.join(temp, "profile"), audit = path.join(temp, "audit"), output = path.join(temp, "output");
  await mkdir(source); await mkdir(audit);
  const normalized = (raw: string | null) => ({ raw, value: raw, alternatives: raw ? [raw] : [], confidence: raw ? "MEDIUM" : "LOW", method: raw ? "RULE" : "UNRESOLVED" });
  const work = (company: string | null, title: string | null, current: boolean) => ({ sequence: 1, company: normalized(company), rawTitle: title, description: "", normalizedFunction: normalized(null), dates: { raw: current ? "2020-至今" : "2016-2019", start: current ? "2020" : "2016", end: current ? null : "2019", startPrecision: "YEAR", endPrecision: current ? "UNKNOWN" : "YEAR", current } });
  const profile = (jobs: ReturnType<typeof work>[]) => ({ queryId: "synthetic", sourceType: "FILE", sourceFormat: "txt", candidateName: "测试姓名", identity: { resumeFingerprint: "synthetic-fingerprint" }, parseStatus: "PARTIAL", completeness: {}, warnings: [], workExperiences: jobs, researchExperiences: [{ sequence: 0, heading: "Research Experience", description: "示例学校的研究项目\n正文完整保留" }], educations: [{ sequence: 1, school: normalized(null), major: normalized(null), degree: null, dates: { raw: null, start: null, end: null, startPrecision: "UNKNOWN", endPrecision: "UNKNOWN", current: false } }], parserVersion: "test", normalizerVersion: "test", parsedAt: "2026-10-30", expiresAt: "2030-01-01" });
  const cases = [
    { file: "ended.txt", profile: profile([work("示例公司", "旧职位", false)]) },
    { file: "current.txt", profile: profile([work("示例公司", "工程师", true)]) },
    { file: "multiple.txt", profile: profile([work("示例公司", "工程师", true), work("另一公司", "研究员", true)]) },
    { file: "missing.txt", profile: profile([work(null, "研究员", true)]) },
  ];
  const manifest: Array<{ key: string; file: string; outcome: string }> = [];
  async function add(name: string, bytes: Uint8Array, payload: unknown, outcome = "valid") {
    const file = path.join(source, name), key = createHash("sha256").update(name).digest("hex").slice(0, 16);
    await writeFile(file, bytes);
    manifest.push({ key, file, outcome });
    await writeFile(path.join(audit, `${key}.json`), JSON.stringify({ file, sourceHash: createHash("sha256").update(bytes).digest("hex"), outcome, ...payload as object }));
  }
  for (const c of cases) await add(c.file, Buffer.from(`synthetic ${c.file}`), { profile: c.profile, issues: [] });
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Sheet1");
  sheet.addRow(["个人简历"]); sheet.addRow(["姓名", "李小明"]); sheet.addRow(["邮箱", "test@example.com"]);
  sheet.addRow(["工作简历", `●2012年-2017年应聘在示例科技有限公司，负责技术工作。●2018年10月至11份在另一集团还是负责技术工作。${"后续说明。".repeat(8)}`]);
  await add("single.xlsx", new Uint8Array(await book.xlsx.writeBuffer() as ArrayBuffer), { code: "UNSUPPORTED_FILE_TYPE" }, "rejected");
  const large = new ExcelJS.Workbook(); const largeSheet = large.addWorksheet("Sheet1");
  largeSheet.addRow(["姓名", "某人"]); largeSheet.addRow(["工作简历", "测试工作经历".repeat(12)]);
  for (let index = 0; index < 21; index++) largeSheet.addRow([`数据${index}`]);
  await add("many.xlsx", new Uint8Array(await large.xlsx.writeBuffer() as ArrayBuffer), { code: "UNSUPPORTED_FILE_TYPE" }, "rejected");
  await writeFile(path.join(audit, "manifest.json"), JSON.stringify(manifest));
  await writeFile(path.join(audit, "summary.json"), JSON.stringify({ total: manifest.length, parserVersion: "test" }));
  const script = path.resolve("scripts/standardize-profile.ts");
  const invoke = (destination: string) => run(process.execPath, ["--import", "tsx", script, source, audit, destination]);
  await invoke(output);
  const records = (await readFile(path.join(output, "records.jsonl"), "utf8")).trim().split("\n").map(line => JSON.parse(line));
  const byFile = (name: string) => records.find(record => record.source.relativePath === name);
  assert.equal(records.length, 6);
  assert.equal(byFile("ended.txt").person.currentTitle, null);
  assert.equal(byFile("current.txt").person.currentTitle, "工程师");
  assert.equal(byFile("multiple.txt").person.currentTitle, null);
  assert.equal(byFile("missing.txt").person.currentTitle, null);
  assert.equal(byFile("missing.txt").workExperiences[0].includedInEmployeeDraft, false);
  assert.equal(byFile("missing.txt").educations[0].includedInEmployeeDraft, false);
  assert.equal(byFile("ended.txt").person.resumeFingerprint, "synthetic-fingerprint");
  assert.equal(byFile("ended.txt").researchExperiences[0].heading, "Research Experience");
  assert.equal(byFile("ended.txt").researchExperiences[0].description, "示例学校的研究项目\n正文完整保留");
  const single = byFile("single.xlsx");
  assert.deepEqual(single.source.fieldEvidence, { nameCell: "B2", emailCell: "B3" });
  assert.equal(single.source.unstructuredSections[0].cell, "B4");
  assert.equal(single.workExperiences.length, 2);
  assert.equal(single.workExperiences[1].dates.end, null, "do not invent a missing end year");
  assert.equal(single.workExperiences[1].includedInEmployeeDraft, false);
  assert.match(single.error.message, /仅部分提取/u);
  assert.equal(byFile("many.xlsx").person.name, null);
  assert.equal(byFile("many.xlsx").workExperiences.length, 0);
  assert.ok(records.every(record => record.reviewStatus === "未复核"));
  await assert.rejects(invoke(output), "existing reviewed output must never be overwritten");
  await writeFile(path.join(source, "ended.txt"), "changed after audit");
  await assert.rejects(invoke(path.join(temp, "changed-output")), /文件或审计记录已变化/u);
  console.log("Standardized export preserves sources, ambiguous records and unverified status; freshness and overwrite protections verified.");
} finally {
  await rm(temp, { recursive: true, force: true });
}
