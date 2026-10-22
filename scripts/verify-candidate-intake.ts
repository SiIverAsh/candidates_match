import assert from "node:assert/strict";

import { submitCandidate } from "../src/modules/candidate-intake/application/submit-candidate";
import type { CandidateIntakeDependencies } from "../src/modules/candidate-intake/application/ports";
import { validateCandidateText } from "../src/modules/candidate-intake/domain/policies";
import { prepareResumeFile } from "../src/modules/candidate-intake/infrastructure/file/prepare-resume-file";

const sufficientText = [
  "工作经历：曾任产品经理，负责企业搜索与数据治理平台。",
  "公司：示例科技有限公司；职位：高级产品经理；任职时间：2021 年至今。",
  "教育经历：示例大学计算机科学专业，本科，2017 年至 2021 年。",
].join("\n");

assert.equal(validateCandidateText("只有一句简介").ok, false);
assert.deepEqual(validateCandidateText(sufficientText), { ok: true, text: sufficientText });
const shortStructuredText = "姓名：测试\n工作经历\n公司：示例药业\n职位：研究员";
const shortTextResult = validateCandidateText(shortStructuredText);
assert.equal(shortTextResult.ok, false);
if (!shortTextResult.ok) assert.equal(shortTextResult.code, "TEXT_TOO_SHORT");
assert.deepEqual(validateCandidateText(shortStructuredText, "WORKBOOK_ROW"), { ok: true, text: shortStructuredText });
assert.equal(validateCandidateText("姓名：测试", "WORKBOOK_ROW").ok, false);
assert.equal(validateCandidateText(`公司：${"长".repeat(100_000)}`, "WORKBOOK_ROW").ok, false);

const invalidPdf = new TextEncoder().encode("not a pdf");
const invalidPdfResult = await prepareResumeFile({
  name: "resume.pdf",
  size: invalidPdf.byteLength,
  type: "application/pdf",
  arrayBuffer: async () => invalidPdf.buffer,
});
assert.equal(invalidPdfResult.ok, false);

const validPdf = new TextEncoder().encode("%PDF-1.4\n1 0 obj\nendobj\n%%EOF");
const validPdfResult = await prepareResumeFile({
  name: "resume.pdf",
  size: validPdf.byteLength,
  type: "application/pdf",
  arrayBuffer: async () => validPdf.buffer,
});
assert.equal(validPdfResult.ok, true);

function dependencies(
  hasActiveVersion: boolean,
): CandidateIntakeDependencies & { saved: unknown[] } {
  const saved: unknown[] = [];
  return {
    saved,
    files: { prepare: prepareResumeFile },
    repository: {
      purgeExpired: () => 0,
      createOrReuse: (...args) => { saved.push(args); return { query: args[0], reused: false }; },
    },
    employeeVersions: {
      readiness: () => ({
        ready: hasActiveVersion,
        activeVersion: hasActiveVersion
          ? { id: "emp-v1", importedAt: "2026-09-24T00:00:00.000Z", employeeCount: 42 }
          : null,
      }),
    },
    now: () => new Date("2026-09-24T02:00:00.000Z"),
    createId: () => "test-id",
  };
}

const unavailable = await submitCandidate(
  { actor: { id: "test", displayName: "test" }, file: null, text: sufficientText },
  dependencies(false),
);
assert.equal(unavailable.kind, "accepted");
if (unavailable.kind === "accepted") assert.equal(unavailable.query.employeeVersionId, null);

const deps = dependencies(true);
const structured = await submitCandidate(
  { actor: { id: "test", displayName: "test" }, file: null, text: shortStructuredText, textOrigin: "WORKBOOK_ROW" },
  dependencies(true),
);
assert.equal(structured.kind, "accepted");
const shortResume = await submitCandidate(
  { actor: { id: "test", displayName: "test" }, file: null, text: shortStructuredText },
  dependencies(true),
);
assert.equal(shortResume.kind, "rejected");
const accepted = await submitCandidate(
  { actor: { id: "test", displayName: "test" }, file: null, text: sufficientText },
  deps,
);
assert.equal(accepted.kind, "accepted");
if (accepted.kind === "accepted") {
  assert.equal(accepted.query.employeeVersionId, "emp-v1");
  assert.equal(accepted.query.status, "QUEUED_FOR_PARSING");
  assert.equal(accepted.query.expiresAt, "2026-10-01T02:00:00.000Z");
}
assert.equal(deps.saved.length, 1);

const chooseOne = await submitCandidate(
  {
    actor: { id: "test", displayName: "test" },
    file: {
      name: "resume.pdf",
      size: validPdf.byteLength,
      type: "application/pdf",
      arrayBuffer: async () => validPdf.buffer,
    },
    text: sufficientText,
  },
  dependencies(true),
);
assert.deepEqual(chooseOne.kind, "rejected");
if (chooseOne.kind === "rejected") assert.equal(chooseOne.code, "CHOOSE_ONE_SOURCE");

const failingDependencies = dependencies(true);
failingDependencies.repository.createOrReuse = () => { throw new Error("storage unavailable"); };
const persistenceFailure = await submitCandidate(
  { actor: { id: "test", displayName: "test" }, file: null, text: sufficientText },
  failingDependencies,
);
assert.equal(persistenceFailure.kind, "persistence_failed");

console.log("Candidate intake verification passed");
