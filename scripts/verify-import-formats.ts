import assert from "node:assert/strict";
import { importFileKind, MAX_RESUME_FILE_BYTES, resumeImportFileIssue } from "../src/shared/domain/import-file";
import { candidateColumnFiltersSchema } from "../src/modules/candidate-intake/presentation/contracts";
import { prepareResumeFile } from "../src/modules/candidate-intake/infrastructure/file/prepare-resume-file";
import { importResumeFiles, type ResumeFileBatchResult } from "../src/modules/employee-data/application/import-resume-files";
import type { EmployeeResumeDraft } from "../src/modules/employee-data/domain/resume-import";

for (const extension of ["PDF", "DOC", "DOCX", "TXT", "HTML", "HTM", "PPTX", "MSG"]) {
  assert.equal(importFileKind(`resume.${extension}`), "resume");
}
assert.equal(importFileKind("staff.xlsx"), "workbook");
assert.equal(importFileKind("archive.zip"), null);
assert.equal(importFileKind("scan.jpg"), null);
assert.equal(importFileKind("scan.png"), null);
assert.match(resumeImportFileIssue({ name: "scan.jpeg", size: 100 })!, /带可选文字/u);
assert.equal(importFileKind("pdf"), null);
assert.equal(candidateColumnFiltersSchema.safeParse({ sourceFormats: ["html", "pptx", "jpg", "jpeg", "png", "msg"] }).success, true);
assert.equal(resumeImportFileIssue({ name: "resume.pdf", size: MAX_RESUME_FILE_BYTES }), null);
assert.match(resumeImportFileIssue({ name: "resume.pdf", size: MAX_RESUME_FILE_BYTES + 1 })!, /50 MB/u);

// The same per-file limit applies in the server preparer, before reading oversized data.
let oversizedRead = false;
const oversized = await prepareResumeFile({ name: "resume.pdf", type: "application/pdf", size: MAX_RESUME_FILE_BYTES + 1, arrayBuffer: async () => { oversizedRead = true; return new ArrayBuffer(0); } });
assert.equal(oversized.ok, false);
if (!oversized.ok) assert.equal(oversized.code, "FILE_TOO_LARGE");
assert.equal(oversizedRead, false);
const largePdfBytes = new Uint8Array(6 * 1024 * 1024);
largePdfBytes.set(new TextEncoder().encode("%PDF-1.4\n"));
largePdfBytes.set(new TextEncoder().encode("%%EOF"), largePdfBytes.length - 5);
const largePdf = new File([largePdfBytes], "large.pdf", { type: "application/pdf" });
assert.equal((await prepareResumeFile(largePdf)).ok, true);

const draft: EmployeeResumeDraft = {
  employee: { employeeId: "test", name: "Test Person", email: "", currentDepartment: "", currentTitle: "" },
  workExperiences: [{ company: "Example Ltd", title: "Engineer", startDate: "2020", endDate: null, current: true }],
  educations: [], warnings: [],
};
const validFiles = [...Array.from({ length: 1_101 }, (_, index) => new File(["sample"], `${index}.txt`)), largePdf];
const skippedFiles = [new File(["data"], "staff.xlsx"), new File(["data"], "attachment.zip"), new File([], "empty.pdf")];
Object.defineProperty(skippedFiles[1], "webkitRelativePath", { value: "folder/nested/attachment.zip" });
const previews: string[] = [];
const batchSizes: number[] = [];
let lastProgress: ResumeFileBatchResult | null = null;
const checkedProgress = new Set<number>();
let checkedBeforeFirstPublish = 0;
const result = await importResumeFiles([...validFiles.slice(0, 10), ...skippedFiles, ...validFiles.slice(10)], {
  preview: async file => { previews.push(file.name); return { kind: "parsed", draft: { ...draft, employee: { ...draft.employee, employeeId: file.name } } }; },
  publish: async drafts => { if (!batchSizes.length) checkedBeforeFirstPublish = lastProgress?.checked ?? 0; batchSizes.push(drafts.length); return { status: "success", message: "ok", issues: [], version: null }; },
  progress: progress => { checkedProgress.add(progress.checked); lastProgress = progress; },
});
assert.equal(result.total, 1_105);
assert.equal(result.processed, result.total);
assert.equal(result.checked, result.total);
assert.equal(checkedProgress.size, result.total + 1);
assert.ok(checkedBeforeFirstPublish >= 100);
assert.equal(result.imported, 1_102);
assert.equal(result.failures.length, 3);
assert.match(result.failures.find(file => file.name === "staff.xlsx")!.message, /单独导入/u);
assert.ok(result.failures.some(file => file.name === "folder/nested/attachment.zip"));
assert.equal(previews.length, validFiles.length);
assert.ok(batchSizes.every(size => size <= 100));
assert.equal(batchSizes.reduce((sum, size) => sum + size, 0), validFiles.length);
assert.deepEqual(lastProgress, result);
assert.equal(result.interrupted, null);

// A schema-rejected HTTP batch has not been published: isolate the bad draft
// and continue with subsequent files, including other drafts from that batch.
const { api } = await import("../src/client/api");
const { employeeResumesSchema } = await import("../src/modules/employee-data/presentation/contracts");
const originalFetch = globalThis.fetch;
const publishedIds: string[] = [];
try {
  globalThis.fetch = async (_input, init) => {
    const drafts = JSON.parse(String(init?.body)) as EmployeeResumeDraft[];
    if (!employeeResumesSchema.safeParse(drafts).success) {
      return Response.json({ error: "员工资料字段或经历格式无效。" }, { status: 400 });
    }
    publishedIds.push(...drafts.map(item => item.employee.employeeId));
    return Response.json({ status: "success", message: "ok", issues: [], totalIssueCount: 0, version: null });
  };
  const files = ["before.txt", "bad.txt", "after.txt"].map(name => new File(["test"], name));
  const isolated = await importResumeFiles(files, {
    preview: async file => ({ kind: "parsed", draft: { ...draft, employee: { ...draft.employee, employeeId: file.name }, workExperiences: file.name === "bad.txt" ? Array.from({ length: 101 }, () => draft.workExperiences[0]) : draft.workExperiences } }),
    publish: api.importEmployeeResumes,
    progress: () => {},
  });
  assert.deepEqual(publishedIds, ["before.txt", "after.txt"]);
  assert.equal(isolated.imported, 2);
  assert.equal(isolated.processed, 3);
  assert.equal(isolated.interrupted, null);
  assert.deepEqual(isolated.failures.map(item => item.name), ["bad.txt"]);

  // A transport failure has an unknown commit outcome and must not be retried.
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw new Error("network disconnected"); };
  const interrupted = await importResumeFiles(files, {
    preview: async file => ({ kind: "parsed", draft: { ...draft, employee: { ...draft.employee, employeeId: file.name } } }),
    publish: api.importEmployeeResumes,
    progress: () => {},
  });
  assert.equal(requests, 1);
  assert.ok(interrupted.interrupted);
  assert.equal(interrupted.imported, 0);
} finally {
  globalThis.fetch = originalFetch;
}
console.log("Resume formats, per-file limits and mixed-folder import verified.");
