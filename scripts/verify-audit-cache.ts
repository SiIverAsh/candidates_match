import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const temporary = await mkdtemp(path.join(tmpdir(), "resume-audit-test-"));
try {
  const input = path.join(temporary, "input");
  const first = path.join(temporary, "first");
  const second = path.join(temporary, "second");
  await mkdir(input);
  const file = path.join(input, "resume.txt");
  const resume = (name: string) => `姓名：${name}\n工作经历\n公司：示例公司\n职位：研究员\n时间：2019-2022\n教育经历\n学校：示例大学\n专业：生物工程\n时间：2015-2019\n${"负责研发工作和技术文档。".repeat(4)}`;
  await writeFile(file, resume("王小明"));
  const audit = path.resolve("scripts/audit-resume-corpus.ts");
  await run(process.execPath, ["--import", "tsx", audit, input, first], { timeout: 60_000 });
  const [{ key }] = JSON.parse(await readFile(path.join(first, "manifest.json"), "utf8"));
  const previous = JSON.parse(await readFile(path.join(first, `${key}.json`), "utf8"));
  assert.equal(previous.profile.candidateName, "王小明");
  assert.match(previous.sourceHash, /^[\da-f]{64}$/u);
  await writeFile(file, resume("李小明"));
  await run(process.execPath, ["--import", "tsx", audit, input, second, `--reparse-from=${first}`], { timeout: 60_000 });
  const current = JSON.parse(await readFile(path.join(second, `${key}.json`), "utf8"));
  assert.notEqual(current.sourceHash, previous.sourceHash);
  assert.equal(current.profile.candidateName, "李小明", "changed files must be extracted again, not silently read from cache");
  console.log("Resume audit cache freshness verified.");
} finally {
  await rm(temporary, { recursive: true, force: true });
}
