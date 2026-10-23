import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { batchReportApplication } from "../src/modules/candidate-batch/browser-composition";
import { createBiopharmaEmployees } from "./fixtures/biopharma-employees";
import type { BatchEvent, BatchItemResult } from "../src/modules/candidate-batch/domain/models";

const directory = mkdtempSync(path.join(tmpdir(), "cf-workbook-"));
process.env.CONNECTION_FINDER_DB_PATH = path.join(directory, "test.sqlite");
const headers = ["姓名", "邮箱", "电话", "工作经历", "教育经历", "简历全文"];
const work = "公司：明澈免疫生物医药有限公司\n职位：免疫学研究员\n任职时间：2021年3月—2024年12月\n开展肿瘤免疫微环境和抗体药物的体外评价。";
const education = "学校：北京大学\n专业：免疫学\n就读时间：2017年9月—2021年6月";
const valid = (name: string) => [name, "", "", work, education, ""];
const escapeXml = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
function columnName(index: number): string {
  let name = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + (n - 1) % 26) + name;
  return name;
}

// Minimal OOXML fixtures deliberately exercise cells and file boundaries without any real data.
async function fixture(rows: Array<Array<string | { formula: string }>>, names = headers, merge = false): Promise<Uint8Array<ArrayBuffer>> {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>');
  zip.file("_rels/.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file("xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="候选人" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file("xl/_rels/workbook.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>');
  const xml = [names, ...rows].map((row, index) => `<row r="${index + 1}">${row.map((value, column) => {
    const ref = `${columnName(column)}${index + 1}`;
    return typeof value === "string" ? `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>` : `<c r="${ref}"><f>${escapeXml(value.formula)}</f><v>1</v></c>`;
  }).join("")}</row>`).join("");
  zip.file("xl/worksheets/sheet1.xml", `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xml}</sheetData>${merge ? '<mergeCells count="1"><mergeCell ref="A2:A3"/></mergeCells>' : ''}</worksheet>`);
  return new Uint8Array(await zip.generateAsync({ type: "arraybuffer", compression: "DEFLATE" }));
}

const { handleApi } = await import("../server/api");
const { candidateBatchApplication: batch } = await import("../src/modules/candidate-batch/composition");
const { candidateIntakeApplication: candidates } = await import("../src/modules/candidate-intake/composition");
const { resumeParserApplication: parser } = await import("../src/modules/resume-parser/composition");
const { matchingApplication: matching } = await import("../src/modules/matching/composition");
const { createSessionCookie } = await import("../src/modules/auth/composition");
const { publishEmployeeData } = await import("../src/modules/employee-data/infrastructure/sqlite/repository");
const actor = { id: "workbook-owner", name: "workbook-owner", displayName: "表格测试", role: "HR_USER" as const };
const cookie = (await createSessionCookie(actor)).split(";")[0];
const server = createServer((request, response) => { void handleApi(request, response).catch(error => { console.error(error); response.writeHead(500).end(); }); });

try {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const call = (route: string, options: RequestInit = {}) => fetch(base + route, { ...options, headers: { Cookie: cookie, ...options.headers } });
  async function upload(bytes: Uint8Array<ArrayBuffer>, match = true, name = "candidates.xlsx") {
    const form = new FormData(); form.set("workbook", new File([bytes], name)); form.set("matchAfterImport", String(match));
    return call("/api/candidate-batch/workbook", { method: "POST", body: form });
  }
  async function results(response: Response): Promise<BatchItemResult[]> {
    assert.equal(response.status, 200, await response.clone().text());
    const events = (await response.text()).trim().split("\n").map(line => JSON.parse(line) as BatchEvent);
    assert.equal(events[0].type, "start");
    assert.equal(events.at(-1)?.type, "done");
    const items = events.flatMap(event => event.type === "item" ? [event.item] : []);
    if (events[0].type === "start") assert.equal(events[0].total, items.length);
    return items;
  }
  assert.equal((await fetch(base + "/api/candidate-batch/template")).status, 401);
  assert.equal((await fetch(base + "/api/candidate-batch/workbook", { method: "POST" })).status, 401);
  const download = await call("/api/candidate-batch/template");
  assert.equal(download.status, 200);
  const template = new Uint8Array(await download.arrayBuffer());
  assert.deepEqual(Buffer.from(template), readFileSync("assets/templates/candidate_import_template.xlsx"));
  const templateItems = await results(await upload(template));
  assert.deepEqual(templateItems.map(item => item.status), ["NEEDS_DATA", "NEEDS_DATA", "NEEDS_DATA"]);
  const first = parser.getProfile(templateItems[0].queryId!, actor.id)!;
  assert.equal(first.candidateName, "顾景行（示例）");
  assert.equal(first.educations[0].major.value, "免疫学");
  assert.equal(first.workExperiences[0].dates.start, "2021-03");
  assert.equal(candidates.getQuery(templateItems[0].queryId!, actor.id)?.sourceType, "TEXT");

  publishEmployeeData(createBiopharmaEmployees(), actor);
  const identityEmployees = createBiopharmaEmployees();
  identityEmployees.employees[0].profileUrl = "https://www.linkedin.com/in/self-exclusion-test/";
  publishEmployeeData(identityEmployees, actor);
  const identityRows = await results(await upload(await fixture([
    ["本人测试", "", "http://linkedin.com/in/Self-Exclusion-Test/?trk=test", work, education],
    ["邮箱本人测试", identityEmployees.employees[0].email.toUpperCase(), "", work, education],
  ], ["姓名", "邮箱", "LinkedIn Public URL", "工作经历", "教育经历"])));
  for (const item of identityRows) {
    const identityRun = matching.getRun(item.queryId!, actor.id)!;
    assert.ok(identityRun.results.every(employee => employee.employeeId !== identityEmployees.employees[0].employeeId), "Excel 身份信息必须保存并用于排除本人");
    assert.ok(identityRun.results.some(employee => employee.employeeId === identityEmployees.employees[1].employeeId), "排除本人不能移除真实共同经历同事");
    assert.equal(identityRun.resultCount, item.employeeContacts?.length);
    assert.equal(identityRun.results[0].rank, 1);
  }
  assert.equal(parser.getProfile(identityRows[0].queryId!, actor.id)?.identity?.profileUrl, "linkedin.com/in/self-exclusion-test");
  assert.equal(parser.getProfile(identityRows[1].queryId!, actor.id)?.identity?.email, identityEmployees.employees[0].email);
  publishEmployeeData(createBiopharmaEmployees(), actor);
  const shortRows = await results(await upload(await fixture([
    ["短字段", "明澈免疫生物医药有限公司", "免疫学研究员"],
    ["仅姓名", "", ""],
    ["仅职位", "", "研究员"],
  ], ["姓名", "当前公司", "当前职位"])));
  assert.ok(shortRows[0].queryId, "简短但有公司和职位的 Excel 行应保存解析，不能按字数拒绝");
  assert.ok(!shortRows[0].message.includes("80"));
  assert.ok(!["FAILED", "IMPORTED"].includes(shortRows[0].status), "启用匹配后，应进入匹配或明确提示需要更多资料");
  assert.equal(shortRows[1].status, "FAILED");
  assert.match(shortRows[1].message, /至少一段工作/);
  assert.equal(shortRows[2].status, "NEEDS_INPUT");
  const shortSchool = await results(await upload(await fixture([["短教育", "北京大学", "免疫学"]], ["姓名", "学校", "专业"])));
  assert.ok(shortSchool[0].queryId, "简短的学校和专业字段应保存解析");
  assert.ok(!shortSchool[0].message.includes("80"));
  const mixedRows = [valid("有效首行"), ["", "", "", work, education, ""], [], ["坏邮箱", "bad-email", "", work, education, ""], ["有公式", "", { formula: "1+1" }, work, education, ""], ["有效末行", "", "001234", work, education, ""]];
  const mixed = await results(await upload(await fixture(mixedRows), false));
  assert.deepEqual(mixed.map(item => item.status), ["IMPORTED", "FAILED", "FAILED", "FAILED", "IMPORTED"]);
  assert.match(mixed[0].label, /第 2 行/);
  assert.match(mixed[2].label, /第 5 行/);
  assert.match(mixed[4].label, /第 7 行/);
  assert.equal(matching.getRun(mixed[0].queryId!, actor.id), null);
  const source = await parser.getPreview(mixed[4].queryId!, actor.id);
  assert.ok(JSON.stringify(source).includes("001234"));
  assert.equal(candidates.getQuery(mixed[0].queryId!, "other-user")?.id, mixed[0].queryId);

  const fullText = `姓名：粘贴的旧姓名\n工作经历\n${work}\n教育经历\n${education}`;
  const full = await results(await upload(await fixture([["姓名列优先", "", "", "公司：不应重复导入", "", fullText]])));
  const fullProfile = parser.getProfile(full[0].queryId!, actor.id)!;
  assert.equal(fullProfile.candidateName, "姓名列优先");
  assert.equal(fullProfile.workExperiences.length, 1);
  assert.equal(full[0].status, "MATCHED");
  const aliases = await results(await upload(await fixture([["英文表头", fullText]], ["name", "resume_text"])));
  assert.equal(aliases[0].status, "MATCHED");
  const missing = await results(await upload(await fixture([["信息缺失", "", "", "", "", "仅有姓名"]])));
  assert.equal(missing[0].status, "FAILED");
  const partial = await results(await upload(await fixture([["仅有教育经历", "", "", "", `${education}\n研究内容：肿瘤免疫微环境与抗体药物体外评价，开展免疫细胞活化、细胞共培养和免疫荧光实验。`, ""]]), false));
  assert.equal(partial[0].status, "IMPORTED");
  assert.equal(parser.getProfile(partial[0].queryId!, actor.id)?.parseStatus, "PARTIAL");

  const extra = await results(await upload(await fixture([[...valid("忽略备注"), { formula: "1+1" }]], [...headers, "内部备注"]), false));
  assert.equal(extra[0].status, "IMPORTED");
  const fields = ["候选人", "公司1", "职位1", "入职日期1", "离职日期1", "公司2", "职位2", "任职时间2", "毕业院校1", "所学专业1", "入学时间1", "毕业时间1", "学校2", "专业2", "就读时间2", "备注"];
  const values = ["自有表格", "明澈免疫生物医药有限公司", "免疫学研究员", "2021.03", "2024.12", "启衡靶向药物有限公司", "药理研究员", "2025.01—至今", "北京大学", "免疫学", "2017.09", "2021.06", "复旦大学", "药物化学", "2022.09—2025.06", "不应成为经历"];
  const detected = await results(await upload(await fixture([[], fields, values], ["招聘候选人汇总"])));
  assert.equal(detected[0].status, "MATCHED");
  assert.match(detected[0].label, /第 4 行/);
  const detectedProfile = parser.getProfile(detected[0].queryId!, actor.id)!;
  assert.equal(detectedProfile.workExperiences.length, 2);
  assert.equal(detectedProfile.educations.length, 2);
  assert.equal(detectedProfile.workExperiences[0].dates.start, "2021-03");
  assert.equal(detectedProfile.educations[0].dates.end, "2021-06");
  assert.equal(detectedProfile.educations[1].major.value, "药物化学");
  const nested = await results(await upload(await fixture([["嵌套列名", "明澈免疫生物医药有限公司", "免疫学研究员", "2021.03", "2024.12", "北京大学", "免疫学", "2017.09", "2021.06"]], ["姓名（必填）", "工作经历1公司", "工作经历1职位", "工作经历1开始时间", "工作经历1结束时间", "教育经历1学校", "教育经历1专业", "教育经历1开始时间", "教育经历1结束时间"])));
  assert.equal(nested[0].status, "MATCHED");
  assert.equal(parser.getProfile(nested[0].queryId!, actor.id)?.parseStatus, "COMPLETE");
  const paragraphs = await results(await upload(await fixture([["多段文字", work, work.replace("明澈免疫生物医药有限公司", "启衡靶向药物有限公司"), education, education.replace("北京大学", "复旦大学")]], ["人员姓名", "工作经验1", "任职经历2", "教育背景1", "学习经历2"]), false));
  const paragraphProfile = parser.getProfile(paragraphs[0].queryId!, actor.id)!;
  assert.equal(paragraphProfile.workExperiences.length, 2);
  assert.equal(paragraphProfile.educations.length, 2);
  const endOnlyValues = [...values]; endOnlyValues[3] = ""; endOnlyValues[10] = "";
  const endOnly = await results(await upload(await fixture([endOnlyValues], fields), false));
  const incomplete = parser.getProfile(endOnly[0].queryId!, actor.id)!;
  assert.equal(incomplete.workExperiences[0].dates.start, null);
  assert.equal(incomplete.workExperiences[0].dates.current, false);
  assert.equal(incomplete.educations[0].dates.start, null);
  const multiZip = await JSZip.loadAsync(await fixture([valid("工作表一")]));
  const secondZip = await JSZip.loadAsync(await fixture([valid("工作表二")]));
  multiZip.file("xl/worksheets/sheet2.xml", await secondZip.file("xl/worksheets/sheet1.xml")!.async("string"));
  multiZip.file("xl/workbook.xml", (await multiZip.file("xl/workbook.xml")!.async("string")).replace('</sheets>', '<sheet name="其他候选人" sheetId="2" r:id="rId2"/></sheets>'));
  multiZip.file("xl/_rels/workbook.xml.rels", (await multiZip.file("xl/_rels/workbook.xml.rels")!.async("string")).replace('</Relationships>', '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>'));
  const multi = await results(await upload(new Uint8Array(await multiZip.generateAsync({type:"arraybuffer"})), false));
  assert.equal(multi.length, 2);
  assert.match(multi[1].label, /其他候选人/);
  const prefixed = await JSZip.loadAsync(await fixture([valid("带命名空间")]));
  const mainNamespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  for (const file of ['xl/workbook.xml', 'xl/worksheets/sheet1.xml']) {
    const xml = await prefixed.file(file)!.async('string');
    prefixed.file(file, xml.replace(`xmlns="${mainNamespace}"`, `xmlns:ss="${mainNamespace}"`).replace(/<(\/?)([a-zA-Z])/gu, '<$1ss:$2'));
  }
  assert.equal((await results(await upload(new Uint8Array(await prefixed.generateAsync({type:"arraybuffer"})), false)))[0].status, "IMPORTED");
  // Some spreadsheet writers use default-namespaced core properties and absolute
  // table relationship targets. Neither should prevent reading the cell values.
  const compatible = await JSZip.loadAsync(await fixture([valid("文档属性兼容测试")], ["姓名", "邮箱", "电话", "完整工作经历", "完整教育经历", "简历全文"]));
  compatible.file("docProps/core.xml", '<coreProperties xmlns="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><lastModifiedBy>合成测试</lastModifiedBy></coreProperties>');
  compatible.file("xl/tables/table1.xml", `<table xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" id="1" name="Candidates" displayName="Candidates" ref="A1:F2"><tableColumns count="6">${headers.map((name, index) => `<tableColumn id="${index + 1}" name="${name}"/>`).join("")}</tableColumns></table>`);
  compatible.file("xl/worksheets/_rels/sheet1.xml.rels", '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="tableRel" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/table" Target="/xl/tables/table1.xml"/></Relationships>');
  compatible.file("xl/worksheets/sheet1.xml", (await compatible.file("xl/worksheets/sheet1.xml")!.async("string")).replace('</worksheet>', '<tableParts count="1"><tablePart xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="tableRel"/></tableParts></worksheet>'));
  const compatibleItems = await results(await upload(new Uint8Array(await compatible.generateAsync({ type: "arraybuffer" })), false));
  assert.equal(compatibleItems[0].status, "IMPORTED");
  const compatibleProfile = parser.getProfile(compatibleItems[0].queryId!, actor.id)!;
  assert.equal(compatibleProfile.workExperiences.length, 1);
  assert.equal(compatibleProfile.educations.length, 1);
  assert.equal(compatibleProfile.workExperiences[0].dates.start, "2021-03");
  assert.equal(compatibleProfile.educations[0].dates.end, "2021-06");
  const merged = await results(await upload(await fixture([valid("合并1"), valid("合并2")], headers, true)));
  assert.ok(merged.every(item => item.status === "FAILED"));

  const beforeErrors = candidates.list(actor.id, {}).total;
  for (const bytes of [new TextEncoder().encode("not an Excel"), await fixture([]), await fixture([valid("重复列")], ["姓名", "姓名", ...headers.slice(2)]), await fixture([valid("缺姓名列")], ["", ...headers.slice(1)])]) {
    assert.equal((await upload(bytes)).status, 400);
  }
  assert.equal((await upload(template, true, "legacy.xls")).status, 400);
  const ole = await upload(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]));
  assert.equal(ole.status, 400);
  assert.match((await ole.json()).error, /旧版 .xls 或加密/);
  await assert.rejects(batch.prepareWorkbook({ name:"large.xlsx", size:11 * 1024 * 1024, type:"", arrayBuffer:async () => new ArrayBuffer(0) }), /10 MB/);
  const bomb = await JSZip.loadAsync(await fixture([valid("过大解压")]));
  bomb.file("padding.bin", new Uint8Array(51 * 1024 * 1024));
  assert.equal((await upload(new Uint8Array(await bomb.generateAsync({type:"arraybuffer",compression:"DEFLATE"})))).status, 400);
  assert.equal(candidates.list(actor.id, {}).total, beforeErrors);

  const largeWorkbook = new File([await fixture(Array.from({length:1500}, (_, i) => valid(`批量候选人${i}`)))], "large-workbook.xlsx");
  assert.equal((await batch.prepareWorkbook(largeWorkbook)).length, 1500);

  const start = Date.now();
  const bulk = await results(await upload(await fixture(Array.from({length:500}, (_, i) => valid(`批量医药候选人${i + 1}`)))));
  assert.equal(bulk.length, 500);
  assert.ok(bulk.every(item => item.status === "MATCHED"));
  assert.equal(new Set(bulk.map(item => item.queryId)).size, 500);
  assert.equal(candidates.list(actor.id, {}).total, beforeErrors + 500);
  const exportBytes = await batchReportApplication.export({ sourceName: "500位候选人.xlsx", total: bulk.length, items: bulk });
  const exported = new ExcelJS.Workbook();
  await exported.xlsx.load(exportBytes.buffer);
  const summary = exported.getWorksheet("候选人匹配汇总")!;
  const details = exported.getWorksheet("员工明细")!;
  assert.equal(summary.rowCount, 504);
  assert.equal(summary.getCell("D5").value, "批量医药候选人1");
  assert.equal(summary.getCell("D504").value, "批量医药候选人500");
  assert.equal(details.rowCount, 4 + bulk.reduce((count, item) => count + item.resultCount, 0));
  for (const item of bulk) {
    assert.equal(item.employeeContacts?.length, item.resultCount);
    assert.equal(item.workbookRow?.rowNumber, item.index + 2);
    const saved = matching.getRun(item.queryId!, actor.id)!;
    assert.deepEqual(item.employeeContacts?.map(employee => employee.email), saved.results.map(employee => employee.email));
  }

  const stopFile = new File([await fixture(Array.from({length:10}, (_, i) => valid(`停止测试${i}`)))], "stop.xlsx");
  const rows = await batch.prepareWorkbook(stopFile);
  const controller = new AbortController();
  let completed = 0;
  for await (const event of batch.process({kind:"workbook",rows,matchAfterImport:false}, actor, controller.signal)) {
    if (event.type === "item" && ++completed === 3) controller.abort();
    if (event.type === "done") assert.equal(event.completed, 3);
  }
  assert.equal(candidates.list(actor.id, {}).total, beforeErrors + 503);
  console.log(`Candidate Excel verification passed: template, row isolation, formulas, limits, ownership, 500 imports with matching and full Excel export (${Date.now() - start} ms), and cancellation.`);
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()));
  rmSync(directory, {recursive:true,force:true});
}
