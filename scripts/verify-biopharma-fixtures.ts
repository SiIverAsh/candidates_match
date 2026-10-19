import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createBiopharmaEmployees } from "./fixtures/biopharma-employees";
import { extractResumeText } from "../src/modules/resume-parser/infrastructure/extraction/extract-resume-text";
import { parseResumeText } from "../src/modules/resume-parser/infrastructure/parsing/parse-resume-text";
import { runMatchingEngine } from "../src/modules/matching/domain/engine";
import type { ResumeSource } from "../src/modules/resume-parser/domain/models";

const directory = process.argv[2] ?? "test_file";
const data = createBiopharmaEmployees();
const employees = data.employees.map(employee => ({
  ...employee,
  workExperiences: data.workExperiences.filter(row => row.employeeId === employee.employeeId).map((row, sequence) => ({ ...row, sequence })),
  educations: data.educationExperiences.filter(row => row.employeeId === employee.employeeId).map((row, sequence) => ({ ...row, sequence })),
}));
const files = (await readdir(directory)).filter(file => /\.(docx|txt)$/.test(file)).sort();
assert.equal(files.length, 15);
for (const file of files) {
  const source: ResumeSource = { queryId: file, submittedBy: "test-user", sourceType: "FILE", sourceFormat: file.endsWith("docx") ? "docx" : "txt", bytes: await readFile(path.join(directory, file)), text: null, expiresAt: "2099-01-01T00:00:00Z" };
  const text = await extractResumeText(source);
  assert.ok(text.ok, file);
  const profile = parseResumeText(source, text.text, "2026-10-19T00:00:00Z");
  const number = Number(file.slice(0, 2));
  assert.equal(profile.parseStatus, [6, 12].includes(number) ? "PARTIAL" : "COMPLETE", file);
  assert.equal(profile.workExperiences.length, [2, 5, 8, 11].includes(number) ? 2 : 1, file);
  assert.equal(profile.educations.length, [2, 3, 4, 8, 9, 10].includes(number) ? 2 : 1, file);
  if ([3, 9].includes(number)) assert.equal(profile.educations[0].dates.start, "2020-09", file);
  const run = runMatchingEngine({ queryId: file, submittedBy: "test-user", submittedAt: "2026-10-19T00:00:00Z", expiresAt: source.expiresAt, employeeVersionId: "biopharma-fixture", profile, employees }, file, "2026-10-19T00:00:00Z");
  if (number === 13) assert.equal(run.results[0]?.confidence, "HIGH");
  if (number === 14) assert.equal(run.results[0]?.confidence, "MEDIUM");
  if (number === 15) assert.equal(run.results.length, 0);
  console.log(file.slice(0, 2), profile.candidateName, profile.parseStatus, run.results.length, run.results[0]?.confidence ?? "NO_MATCH");
}
