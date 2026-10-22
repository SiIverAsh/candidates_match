import JSZip from "jszip";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractDocText } from "../../../../shared/infrastructure/word/extract-doc-text";

import type { TextExtractionResult } from "../../application/ports";
import type { ResumeSource } from "../../domain/models";

const MAX_EXTRACTED_CHARACTERS = 200_000;

function decodeXml(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const archive = await JSZip.loadAsync(bytes);
  const document = archive.file("word/document.xml");
  if (!document) throw new Error("DOCX_MAIN_DOCUMENT_MISSING");
  const xml = await document.async("string");
  return decodeXml(
    xml
      .replace(/<w:tab\b[^>]*\/>/gu, "\t")
      .replace(/<w:br\b[^>]*\/>/gu, "\n")
      .replace(/<\/w:p>/gu, "\n")
      .replace(/<[^>]+>/gu, ""),
  );
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const loadingTask = getDocument({ data: bytes, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const positioned: Array<{ text: string; x: number; y: number; width: number; height: number }> = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        positioned.push({ text: item.str, x, y, width: item.width, height: item.height });
      }
      positioned.sort((left, right) => left.y - right.y || left.x - right.x);
      const rows: Array<{ y: number; height: number; items: typeof positioned }> = [];
      for (const item of positioned) {
        const row = rows.at(-1);
        if (row && Math.abs(item.y - row.y) <= Math.max(2, Math.min(row.height, item.height) * 0.3)) row.items.push(item);
        else rows.push({ y: item.y, height: item.height, items: [item] });
      }
      pages.push(rows.map(row => {
        row.items.sort((left, right) => left.x - right.x);
        return row.items.map((item, index) => {
          const previous = row.items[index - 1];
          if (!previous) return item.text;
          const gap = item.x - previous.x - previous.width;
          const space = gap > Math.max(previous.height, item.height) * 0.8 ? "   " : gap > 0.5 ? " " : "";
          return space + item.text;
        }).join("");
      }).join("\n"));
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages.join("\n\n");
}

function cleanText(text: string): string {
  return text
    .replaceAll("\u0000", "")
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export async function extractResumeText(source: ResumeSource): Promise<TextExtractionResult> {
  try {
    let text: string;
    if (source.sourceType === "TEXT") text = source.text ?? "";
    else if (!source.bytes) throw new Error("SOURCE_BYTES_MISSING");
    else if (source.sourceFormat === "txt") {
      text = new TextDecoder("utf-8", { fatal: true }).decode(source.bytes);
    } else if (source.sourceFormat === "doc") text = await extractDocText(source.bytes);
    else if (source.sourceFormat === "docx") text = await extractDocx(source.bytes);
    else if (source.sourceFormat === "pdf") text = await extractPdf(source.bytes);
    else throw new Error("UNSUPPORTED_SOURCE_FORMAT");

    const cleaned = cleanText(text);
    if (!cleaned) {
      return {
        ok: false,
        code: "NO_EXTRACTABLE_TEXT",
        message: "未能从资料中读取文本；扫描版 PDF 请先转换为可选择文字的 PDF 或粘贴文本。",
      };
    }
    if (cleaned.length > MAX_EXTRACTED_CHARACTERS) {
      return { ok: false, code: "EXTRACTED_TEXT_TOO_LARGE", message: "解析后的文本超过安全限制。" };
    }
    return { ok: true, text: cleaned };
  } catch {
    return { ok: false, code: "SOURCE_UNREADABLE", message: "简历正文读取失败，请更换文件或粘贴文本后重试。" };
  }
}
