import assert from "node:assert/strict";
import JSZip from "jszip";

process.env.CONNECTION_FINDER_DB_PATH = ":memory:";
const [{ employeeDataApplication }, { candidateIntakeApplication }, repository] = await Promise.all([
  import("../src/modules/employee-data/composition"),
  import("../src/modules/candidate-intake/composition"),
  import("../src/modules/employee-data/infrastructure/sqlite/repository"),
]);
const actor = { id: "admin", displayName: "Admin" };
const lines = ["Name: Alice Smith", "Email: alice@example.com", "Education", "2018 - 2022, Peking University, Computer Science", "Work Experience", "2022 - 2025, Microsoft, Product Manager"];
const archive = new JSZip();
archive.file("[Content_Types].xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml");
archive.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${lines.map(line => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
const docx = new File([Uint8Array.from(await archive.generateAsync({ type: "nodebuffer" })).buffer], "alice.docx");
function createSimplePdf(lines: string[]): Uint8Array {
  const escaped = lines.map((line) => line.replace(/[()\\]/g, "\\$&"));
  const commands = escaped.map((line, index) =>
    `${index === 0 ? "72 720 Td" : "0 -18 Td"} (${line}) Tj`).join("\n");
  const stream = `BT /F1 12 Tf\n${commands}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${new TextEncoder().encode(stream).byteLength} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(new TextEncoder().encode(pdf).byteLength);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(pdf).byteLength;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

const pdfBytes = createSimplePdf(lines);
const pdf = await employeeDataApplication.previewResume({ name: "alice.pdf", type: "application/pdf", size: pdfBytes.byteLength, arrayBuffer: async () => Uint8Array.from(pdfBytes).buffer });
assert.equal(pdf.kind, "parsed");
const corrupt = await employeeDataApplication.previewResume(new File(["invalid"], "broken.doc"));
assert.equal(corrupt.kind, "rejected");
const first = await employeeDataApplication.previewResume(docx);
assert.equal(first.kind, "parsed");
if (first.kind !== "parsed") throw new Error("DOCX preview failed");
const second = structuredClone(first.draft);
second.employee.employeeId = "other-id";
second.employee.email = "other@example.com";
second.employee.name = "Bob";
const invalid = structuredClone(second);
invalid.employee.name = "";
const failure = employeeDataApplication.importResumes([first.draft, invalid], actor);
assert.equal(failure.kind, "validation_failed");
assert.equal(repository.getEmployeeDataOverview().activeVersion, null);
const duplicate = structuredClone(second);
duplicate.employee.email = first.draft.employee.email;
assert.equal(employeeDataApplication.importResumes([first.draft, duplicate], actor).kind, "validation_failed");
assert.equal(repository.getEmployeeDataOverview().activeVersion, null);
const published = employeeDataApplication.importResumes([first.draft, second], actor);
assert.equal(published.kind, "published");
if (published.kind !== "published") throw new Error("Batch import failed");
assert.equal(published.version.employeeCount, 2);
assert.equal(candidateIntakeApplication.getReadiness().ready, true);
assert.throws(() => employeeDataApplication.deleteEmployees("old-version", [second.employee.employeeId], actor));
assert.throws(() => employeeDataApplication.deleteEmployees(published.version.id, [second.employee.employeeId, "missing"], actor));
assert.equal(repository.getEmployeeDataOverview().activeVersion?.id, published.version.id);
const afterDelete = employeeDataApplication.deleteEmployees(published.version.id, [second.employee.employeeId], actor);
assert.equal(afterDelete.employeeCount, 1);
assert.ok(repository.findEmployeeProfile(second.employee.employeeId, published.version.id));
assert.equal(repository.findEmployeeProfile(second.employee.employeeId, afterDelete.id), null);
assert.ok(repository.findEmployeeProfile(first.draft.employee.employeeId, afterDelete.id));
const empty = employeeDataApplication.deleteEmployees(afterDelete.id, [first.draft.employee.employeeId], actor);
assert.equal(empty.employeeCount, 0);
assert.equal(empty.workExperienceCount, 0);
assert.equal(empty.educationCount, 0);
assert.equal(candidateIntakeApplication.getReadiness().ready, false);
console.log("Employee batch import and deletion verified.");
