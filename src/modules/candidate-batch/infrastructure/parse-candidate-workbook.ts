import ExcelJS, { type Cell } from "exceljs";
import JSZip from "jszip";
import { Readable } from "node:stream";
import type { CandidateWorkbookParser } from "../application/ports";
import { BatchInputError } from "../domain/models";
import { CANDIDATE_WORKBOOK_LIMITS, assembleWorkbookValues, detectWorkbookHeader, prepareWorkbookRow, type CandidateColumn, type WorkbookCandidateRow } from "../domain/workbook";

// Bound actual decompressed bytes, including entries that ExcelJS would otherwise ignore.
async function loadWorkbook(bytes: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const signature = new Uint8Array(bytes);
  if (signature[0] === 0xd0 && signature[1] === 0xcf) throw new BatchInputError("文件是旧版 .xls 或加密工作簿，请在 Excel／WPS 中取消密码并另存为 .xlsx；只修改文件后缀无效。");
  let archive: JSZip;
  try { archive = await JSZip.loadAsync(bytes); }
  catch { throw new BatchInputError("无法打开 Excel 文件容器，文件可能损坏或并非真正的 .xlsx。请在 Excel／WPS 中打开后重新另存为 .xlsx。"); }
  if (!archive.file("xl/workbook.xml")) throw new BatchInputError("文件不是有效的 XLSX 工作簿。");
  if (archive.file("xl/vbaProject.bin")) throw new BatchInputError("请移除宏并另存为 .xlsx 后上传。");
  const normalized = new JSZip();
  let expandedBytes = 0;
  for (const entry of Object.values(archive.files)) {
    if (entry.dir) continue;
    const chunks: Uint8Array[] = [];
    for await (const chunk of new Readable().wrap(entry.nodeStream("nodebuffer"))) {
      expandedBytes += chunk.byteLength;
      if (expandedBytes > CANDIDATE_WORKBOOK_LIMITS.maxExpandedBytes) throw new BatchInputError("Excel 解压内容过大，请删除图片、无关工作表或拆分文件。");
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks);
    // Import cell data only. Document properties and structured-table definitions
    // can use valid OOXML forms that ExcelJS cannot load; neither carries row values.
    if (entry.name.startsWith("docProps/") || entry.name.startsWith("xl/tables/")) continue;
    // The downloadable artifact-tool template uses x: namespace prefixes.
    let xml = content.toString("utf8");
    if (entry.name.endsWith(".xml")) {
      const namespaces = [...xml.matchAll(/xmlns:([\w]+)=["']http:\/\/(?:schemas.openxmlformats.org\/spreadsheetml\/2006\/main|purl.oclc.org\/ooxml\/spreadsheetml\/main)["']/gu)];
      for (const [, prefix] of namespaces) xml = xml.replaceAll(new RegExp(`<(\\/?)${prefix}:`, "gu"), "<$1");
    }
    normalized.file(entry.name, entry.name.endsWith(".xml") ? xml : content);
  }
  const workbook = new ExcelJS.Workbook();
  try { await workbook.xlsx.load(await normalized.generateAsync({ type: "arraybuffer" }), { ignoreNodes: ["tableParts"] }); }
  catch { throw new BatchInputError("已打开 Excel 文件，但工作簿内部结构未能解析。请用 Excel／WPS 另存为新的 .xlsx；这不是列名或经历字段缺失导致的错误。"); }
  return workbook;
}

function cellText(cell: Cell): string {
  const value = cell.value;
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "richText" in value) return value.richText.map(run => run.text).join("").trim();
  if (typeof value === "object" && "hyperlink" in value) return String(value.text).trim();
  throw new BatchInputError("单元格须为文本或数字；公式请先复制并粘贴为值。");
}

export const candidateWorkbookParser: CandidateWorkbookParser = {
  async parse(bytes) {
    let workbook: ExcelJS.Workbook;
    try { workbook = await loadWorkbook(bytes); }
    catch (error) {
      if (error instanceof BatchInputError) throw error;
      throw new BatchInputError("Excel 解压读取失败，请检查文件是否完整，或用 Excel／WPS 重新保存后上传。");
    }
    const tables = workbook.worksheets.flatMap(sheet => {
      const headerRows = [];
      for (let rowNumber = 1; rowNumber <= Math.min(20, sheet.rowCount); rowNumber++) {
        const cells: { column: number; text: string }[] = [];
        sheet.getRow(rowNumber).eachCell((cell, column) => {
          if (typeof cell.value === "string") cells.push({ column, text: cell.value.trim() });
          else if (cell.value && typeof cell.value === "object" && "richText" in cell.value) cells.push({ column, text: cellText(cell) });
        });
        headerRows.push({ rowNumber, cells });
      }
      const header = detectWorkbookHeader(headerRows);
      return header ? [{ sheet, header }] : [];
    });
    if (!tables.length) throw new BatchInputError("未识别到候选人表头。请在工作表前 20 行内提供姓名，以及工作经历、教育经历、公司、学校或简历内容等列；列顺序不限。");
    const rows: WorkbookCandidateRow[] = [];
    for (const { sheet, header } of tables) {
      const keys = header.columns.map(column => `${["name", "email", "phone", "resume"].includes(column.field) ? 1 : column.group}:${column.field}`);
      if (new Set(keys).size !== keys.length) throw new BatchInputError(`“${sheet.name}”第 ${header.rowNumber} 行存在重复含义的列；多段经历请标为“公司1、职位1、公司2、职位2”等。`);
      sheet.eachRow((sourceRow, rowNumber) => {
        if (rowNumber <= header.rowNumber) return;
        const cells: { field: CandidateColumn; group: number; text: string }[] = [];
        let error: string | null = null;
        let hasContent = false;
        for (const mapping of header.columns) {
          const cell = sourceRow.getCell(mapping.column);
          try {
            const text = cellText(cell);
            if (!text) continue;
            hasContent = true;
            if (cell.isMerged) error = "候选人资料含合并单元格，请拆开并补齐每行资料，以免重复导入。";
            cells.push({ field: mapping.field, group: mapping.group, text });
          } catch (failure) {
            hasContent = true;
            error = failure instanceof Error ? failure.message : "单元格读取失败。";
          }
        }
        if (!hasContent) return;
        rows.push({ ...prepareWorkbookRow(rowNumber, assembleWorkbookValues(cells), error), sheetName: sheet.name });
      });
    }
    if (!rows.length) throw new BatchInputError("Excel 中没有候选人记录，请在表头下方填写数据。");
    return rows;
  },
};
