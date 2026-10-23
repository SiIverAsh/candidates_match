import ExcelJS from "exceljs";
import JSZip from "jszip";
import { Readable } from "node:stream";

export class WorkbookReadError extends Error {}

// Import cell data only; document properties and structured-table definitions
// are not needed and some valid OOXML forms are unsupported by ExcelJS.
export async function readWorkbook(bytes: ArrayBuffer, maxExpandedBytes = 50 * 1024 * 1024): Promise<ExcelJS.Workbook> {
  const signature = new Uint8Array(bytes);
  if (signature[0] === 0xd0 && signature[1] === 0xcf) throw new WorkbookReadError("文件是旧版 .xls 或加密工作簿，请在 Excel／WPS 中取消密码并另存为 .xlsx；只修改文件后缀无效。");
  let archive: JSZip;
  try { archive = await JSZip.loadAsync(bytes); }
  catch { throw new WorkbookReadError("无法打开 Excel 文件容器，文件可能损坏或并非真正的 .xlsx。请重新另存为 .xlsx。"); }
  if (!archive.file("xl/workbook.xml")) throw new WorkbookReadError("文件不是有效的 XLSX 工作簿。");
  if (archive.file("xl/vbaProject.bin")) throw new WorkbookReadError("请移除宏并另存为 .xlsx 后上传。");
  const normalized = new JSZip();
  let expandedBytes = 0;
  for (const entry of Object.values(archive.files)) {
    if (entry.dir) continue;
    const chunks: Uint8Array[] = [];
    for await (const chunk of new Readable().wrap(entry.nodeStream("nodebuffer"))) {
      expandedBytes += chunk.byteLength;
      if (expandedBytes > maxExpandedBytes) throw new WorkbookReadError("Excel 解压内容过大，请删除图片、无关工作表或拆分文件。");
      chunks.push(chunk);
    }
    if (entry.name.startsWith("docProps/") || entry.name.startsWith("xl/tables/")) continue;
    const content = Buffer.concat(chunks);
    if (!entry.name.endsWith(".xml")) { normalized.file(entry.name, content); continue; }
    let xml = content.toString("utf8");
    for (const [, prefix] of xml.matchAll(/xmlns:([\w]+)=["']http:\/\/(?:schemas.openxmlformats.org\/spreadsheetml\/2006\/main|purl.oclc.org\/ooxml\/spreadsheetml\/main)["']/gu)) {
      xml = xml.replaceAll(new RegExp(`<(\\/?)${prefix}:`, "gu"), "<$1");
    }
    normalized.file(entry.name, xml);
  }
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(await normalized.generateAsync({ type: "arraybuffer" }), { ignoreNodes: ["tableParts"] }); }
  catch { throw new WorkbookReadError("Excel 内部结构无法解析，请用 Excel／WPS 另存为新的 .xlsx；此错误发生在表头校验之前。"); }
  return workbook;
}
