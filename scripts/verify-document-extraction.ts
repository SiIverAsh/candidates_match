import assert from "node:assert/strict";
import JSZip from "jszip";
import { extractDocText } from "../src/shared/infrastructure/word/extract-doc-text";
import { extractDocxText, wordXmlText } from "../src/shared/infrastructure/word/extract-docx-text";
import { extractHtmlDocument } from "../src/shared/infrastructure/word/html-text";
import { prepareResumeFile } from "../src/modules/candidate-intake/infrastructure/file/prepare-resume-file";
import { extractResumeText, hasInsufficientTextLayer } from "../src/modules/resume-parser/infrastructure/extraction/extract-resume-text";
import { renderPositionedText, type PositionedText } from "../src/modules/resume-parser/infrastructure/extraction/positioned-text";
import { extractEmfText } from "../src/modules/resume-parser/infrastructure/extraction/metafile-text";
import { extractPresentationText } from "../src/modules/resume-parser/infrastructure/extraction/extract-presentation-text";

const html = '<html><head><style>ignore</style></head><body><p>示例人员</p><p>教育经历：示例大学 &amp; 学院</p><table><tr><td>工作经历</td><td>示例公司</td></tr></table><script>ignore</script></body></html>';
assert.equal(extractHtmlDocument(Buffer.from(html)).includes("示例大学 & 学院"), true);
assert.equal(extractHtmlDocument(Buffer.from(html)).includes("ignore"), false);
assert.match(extractHtmlDocument(Buffer.from(html)), /工作经历\t示例公司/u, "HTML 表格单元格必须保留边界");
assert.equal(extractHtmlDocument(Buffer.from("<html><body><p>alpha\tbeta</p><table><tr><td>A</td><td>B</td></tr></table></body></html>")), "alpha beta\nA\tB", "普通 HTML 空白归一化与单元格分隔应分别处理");
assert.equal(extractHtmlDocument(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(html, "utf16le")])).includes("工作经历"), true);
for (const transfer of ["base64", "quoted-printable"]) {
  const body = transfer === "base64" ? Buffer.from(html).toString("base64") : [...Buffer.from(html)].map(value => `=${value.toString(16).padStart(2,"0")}`).join("");
  const mime = `MIME-Version: 1.0\r\nContent-Type: multipart/related;\r\n boundary="fixture"\r\n\r\n--fixture\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: ${transfer}\r\n\r\n${body}\r\n--fixture--`;
  assert.equal((await extractDocText(Buffer.from(mime))).includes("示例大学 & 学院"), true);
}
const xml = '<w:document><w:body><w:p><w:r><w:t>教育</w:t></w:r><w:r><w:t>经历</w:t></w:r><w:del><w:r><w:t>过时内容</w:t></w:r></w:del></w:p><w:tr><w:tc><w:p><w:r><w:t>示例大学</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>本科</w:t></w:r></w:p></w:tc></w:tr></w:body></w:document>';
assert.equal(wordXmlText(xml).includes("教育经历"), true);
assert.equal(wordXmlText(xml).includes("过时内容"), false);
const zip = new JSZip().file("word/document.xml", xml).file("word/header1.xml", "<w:p><w:r><w:t>示例人员</w:t></w:r></w:p>").file("[Content_Types].xml", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml");
const docx = await zip.generateAsync({ type: "uint8array" });
assert.equal((await extractDocxText(docx)).startsWith("示例人员"), true);
assert.equal((await extractDocText(docx)).includes("示例大学"), true);
for (const [name, bytes] of [["resume.doc", Buffer.from(html)], ["resume.doc", docx], ["resume.htm", Buffer.from(html)]] as const) {
  const prepared = await prepareResumeFile({ name, type: "", size: bytes.length, arrayBuffer: async () => Uint8Array.from(bytes).buffer });
  assert.equal(prepared.ok, true, name);
}
const falseDoc = Buffer.from("This is not a document file.");
assert.equal((await prepareResumeFile({ name: "fake.doc", type: "", size: falseDoc.length, arrayBuffer: async () => Uint8Array.from(falseDoc).buffer })).ok, false);
assert.equal(hasInsufficientTextLayer("Only a short page header", true), true);
assert.equal(hasInsufficientTextLayer("", false), false, "blank pages do not require image warnings");
assert.equal(hasInsufficientTextLayer("Native resume text ".repeat(100), true), false);
assert.equal(hasInsufficientTextLayer("\uFFFD".repeat(100), false), true);
const positioned = (text: string, x: number, y: number, width = 150): PositionedText => ({text,x,y,width,height:10});
assert.equal(renderPositionedText([positioned("教",10,10,10), positioned("育经历",21,10,30)],600,800), "教育经历");
const shadowed = [
  positioned("Example University", 30, 50, 130),
  positioned("Example University", 30.38671875, 50, 130),
  positioned("Sep 2020 - Present", 30, 75, 120),
  positioned("Sep 2020 - Present", 30, 75, 120),
  positioned("Sep 2020 - Present", 30.2, 75.4, 120),
  positioned("Example University", 30, 100, 130),
];
assert.equal(renderPositionedText(shadowed,600,800), "Example University\nSep 2020 - Present\nExample University", "only matching text at the same position is deduplicated");
assert.equal(renderPositionedText([positioned("张乐乐",30,50,30),positioned("张乐乐",30.3,50,30)],600,800), "张乐乐", "double-character names remain intact");
assert.equal(renderPositionedText([positioned("乐",30,50,10),positioned("乐",40,50,10)],600,800), "乐乐", "adjacent identical glyphs remain intact");
assert.equal(renderPositionedText([positioned("ABC",30,50,30),positioned("XYZ",30,50,30)],600,800), "ABCXYZ", "different text at the same coordinates is retained");
assert.equal(renderPositionedText([positioned("ABC",30,50,30),positioned("ABC",30,50,60)],600,800), "ABCABC", "different text bounds are retained");
const columns = Array.from({length:15},(_,i)=>[positioned(`左栏完整描述${i}`,30,150+i*25),positioned(`右栏完整描述${i}`,340,150+i*25)]).flat();
const rendered = renderPositionedText(columns,600,800);
assert.ok(rendered.indexOf("左栏完整描述14") < rendered.indexOf("右栏完整描述0"), "independent columns read top to bottom");
const dates = Array.from({length:15},(_,i)=>[positioned("2020-2024",30,150+i*25,70),positioned(`示例公司职位描述${i}`,340,150+i*25)]).flat();
const dateText = renderPositionedText(dates,600,800);
assert.ok(dateText.split("\n")[0].includes("2020-2024") && dateText.split("\n")[0].includes("示例公司"), "aligned dates remain attached to their rows");
const text = Buffer.from("示例大学", "utf16le"), record = Buffer.alloc(76+text.length);
record.writeUInt32LE(84,0);record.writeUInt32LE(record.length,4);record.writeUInt32LE(text.length/2,44);record.writeUInt32LE(76,48);text.copy(record,76);
assert.equal(extractEmfText(record), "示例大学");
record.writeUInt32LE(0x10,52);assert.equal(extractEmfText(record), "");
assert.equal(extractEmfText(record.subarray(0,40)), "");
const slides = new JSZip().file("ppt/slides/slide2.xml", "<a:p><a:r><a:t>Second</a:t></a:r></a:p>").file("ppt/slides/slide1.xml", "<a:p><a:r><a:t>First</a:t></a:r></a:p>");
assert.equal((await extractPresentationText(await slides.generateAsync({type:"uint8array"}))).trim(), "First\n\n\nSecond");
const imageOnlyDocx = new JSZip().file("word/document.xml", "<w:document><w:body/></w:document>").file("word/media/image1.png", new Uint8Array([1,2,3]));
const imageOnlySource = { sourceType: "FILE" as const, sourceFormat: "docx" as const, bytes: await imageOnlyDocx.generateAsync({type:"uint8array"}), text: null, queryId: "test", submittedBy: "test", expiresAt: "2030-01-01T00:00:00Z" };
const imageOnly = await extractResumeText(imageOnlySource);
assert.equal(imageOnly.ok, false);
if (!imageOnly.ok) assert.equal(imageOnly.code, "TEXT_LAYER_MISSING");
const mixedDocx = new JSZip().file("word/document.xml", `<w:document><w:body><w:p><w:t>${"Readable native text ".repeat(30)}</w:t></w:p><wp:extent cx="5000000" cy="7000000"/></w:body></w:document>`).file("word/media/image1.png", new Uint8Array([1,2,3]));
const mixed = await extractResumeText({...imageOnlySource, bytes: await mixedDocx.generateAsync({type:"uint8array"})});
assert.equal(mixed.ok,true);
if (mixed.ok) { assert.ok(mixed.text.includes("Readable native text")); assert.ok(mixed.warnings?.some(warning=>warning.includes("图片内文字未被读取"))); }
const image = await prepareResumeFile({name:"scan.jpg",type:"image/jpeg",size:3,arrayBuffer:async()=>new Uint8Array([0xff,0xd8,0xff]).buffer});
assert.equal(image.ok, false);
if (!image.ok) assert.equal(image.code,"IMAGE_ONLY");
slides.file("ppt/presentation.xml", '<p:presentation><p:sldIdLst><p:sldId id="2" r:id="rId2"/><p:sldId id="1" r:id="rId1"/></p:sldIdLst></p:presentation>');
slides.file("ppt/_rels/presentation.xml.rels", '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>');
assert.equal((await extractPresentationText(await slides.generateAsync({type:"uint8array"}))).trim(), "Second\n\n\nFirst");
slides.file("ppt/presentation.xml", '<p:presentation><p:sldIdLst><p:sldId id="1" r:id="rId1"/></p:sldIdLst></p:presentation>');
assert.equal((await extractPresentationText(await slides.generateAsync({type:"uint8array"}))).trim(), "First", "不应读取未被演示文稿引用的遗留幻灯片");
slides.file("ppt/presentation.xml", '<p:presentation><p:sldIdLst><p:sldId id="3" r:id="missing"/></p:sldIdLst></p:presentation>');
await assert.rejects(extractPresentationText(await slides.generateAsync({type:"uint8array"})), /PPTX_SLIDE_RELATIONSHIP_INVALID/u);
console.log("Document extraction verification passed (synthetic fixtures only)");
