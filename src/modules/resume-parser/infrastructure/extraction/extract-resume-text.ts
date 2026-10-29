import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { getDocument, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import { extractMsgAttachment } from "../../../../shared/infrastructure/word/extract-msg-attachment";
import { extractDocText } from "../../../../shared/infrastructure/word/extract-doc-text";
import { extractDocxText } from "../../../../shared/infrastructure/word/extract-docx-text";
import { extractHtmlDocument } from "../../../../shared/infrastructure/word/html-text";
import { renderPositionedText, type PositionedText } from "./positioned-text";
import { extractPresentationText } from "./extract-presentation-text";

import type { TextExtractionResult } from "../../application/ports";
import type { ResumeSource } from "../../domain/models";

const MAX_EXTRACTED_CHARACTERS = 200_000;
const PDF_RESOURCES = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));

export function hasInsufficientTextLayer(text: string, hasLargeImage: boolean): boolean {
  const compact = text.replace(/\s/gu, "");
  const unreadable = (compact.match(/[\uFFFD\uE000-\uF8FF]/gu) ?? []).length;
  return (compact.length < 180 && hasLargeImage) || unreadable > Math.max(3, compact.length * 0.05);
}

async function extractPdf(bytes: Uint8Array, warnings: string[]): Promise<string> {
  const loadingTask = getDocument({
    data: Uint8Array.from(bytes),
    useSystemFonts: false,
    cMapUrl: join(PDF_RESOURCES, "cmaps") + sep,
    cMapPacked: true,
    standardFontDataUrl: join(PDF_RESOURCES, "standard_fonts") + sep,
    wasmUrl: join(PDF_RESOURCES, "wasm") + sep,
  });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  const visualPages: number[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const positioned: PositionedText[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        positioned.push({ text: item.str, x, y, width: item.width, height: item.height });
      }
      const pageText = renderPositionedText(positioned, viewport.width, viewport.height);
      pages.push(pageText);
      // A native header can coexist with a scanned body. Inspect raster drawing
      // dimensions on sparse pages, rather than using document-wide text length.
      let hasLargeImage = false;
      let totalImageArea = 0;
      let pathCount = 0;
      if (pageText.replace(/\s/gu, "").length < 180) {
        const operations = await page.getOperatorList();
        let matrix = [1, 0, 0, 1, 0, 0];
        const stack: number[][] = [];
        for (let i = 0; i < operations.fnArray.length; i += 1) {
          const operation = operations.fnArray[i];
          if (operation === OPS.constructPath) pathCount += 1;
          if (operation === OPS.save) stack.push([...matrix]);
          else if (operation === OPS.restore) matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
          else if (operation === OPS.transform) {
            const m = operations.argsArray[i] as number[];
            const [a, b, c, d, e, f] = matrix;
            matrix = [a*m[0]+c*m[1], b*m[0]+d*m[1], a*m[2]+c*m[3], b*m[2]+d*m[3], a*m[4]+c*m[5]+e, b*m[4]+d*m[5]+f];
          } else if (operation === OPS.paintImageXObject || operation === OPS.paintInlineImageXObject || operation === OPS.paintImageMaskXObject) {
            const area = Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]);
            totalImageArea += area;
            if (area > viewport.width * viewport.height * 0.2) hasLargeImage = true;
          }
        }
      }
      if (hasInsufficientTextLayer(pageText, hasLargeImage || totalImageArea > viewport.width * viewport.height * 0.3 || pathCount > 80)) visualPages.push(pageNumber);
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  if (visualPages.length) {
    if (!pages.join("").trim()) throw new Error("TEXT_LAYER_MISSING");
    warnings.push(`第 ${visualPages.join("、")} 页包含无法直接读取的图片、轮廓文字或损坏文字层；当前仅提取可读取文字，请对照原文件补充。`);
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
    const warnings: string[] = [];
    if (source.sourceType === "TEXT") text = source.text ?? "";
    else if (!source.bytes) throw new Error("SOURCE_BYTES_MISSING");
    else if (source.sourceFormat === "txt") {
      text = new TextDecoder("utf-8", { fatal: true }).decode(source.bytes);
    } else if (source.sourceFormat === "doc") text = await extractDocText(source.bytes, warnings);
    else if (source.sourceFormat === "docx") {
      text = await extractDocxText(source.bytes, warnings);
    }
    else if (source.sourceFormat === "pdf") text = await extractPdf(source.bytes, warnings);
    else if (source.sourceFormat === "msg") {
      const attachment = await extractMsgAttachment(source.bytes);
      const extracted = await extractResumeText({ ...source, sourceFormat: attachment.format, bytes: attachment.bytes });
      if (!extracted.ok) return extracted;
      text = extracted.text;
      warnings.push("已读取邮件中的单份文档附件，请核对人员与附件内容。", ...(extracted.warnings ?? []));
    }
    else if (source.sourceFormat === "html") text = extractHtmlDocument(source.bytes);
    else if (source.sourceFormat === "pptx") text = await extractPresentationText(source.bytes, warnings);
    else if (["jpg", "jpeg", "png"].includes(source.sourceFormat ?? "")) {
      throw new Error("IMAGE_ONLY");
    }
    else throw new Error("UNSUPPORTED_SOURCE_FORMAT");

    const cleaned = cleanText(text);
    if (!cleaned) {
      return {
        ok: false,
        code: "NO_EXTRACTABLE_TEXT",
        message: "未能从资料中读取文本；请检查文件内容或粘贴简历文本。",
      };
    }
    if (cleaned.length > MAX_EXTRACTED_CHARACTERS) {
      return { ok: false, code: "EXTRACTED_TEXT_TOO_LARGE", message: "解析后的文本超过安全限制。" };
    }
    return { ok: true, text: cleaned, ...(warnings.length ? { warnings: [...new Set(warnings)] } : {}) };
  } catch (error) {
    if (error instanceof Error && ["TEXT_LAYER_MISSING", "IMAGE_ONLY"].includes(error.message)) {
      return { ok: false, code: error.message, message: "该资料只有图片或轮廓，没有可读取的文字层。请提供带可选择文字的 PDF、Word 或粘贴简历文本。" };
    }
    return { ok: false, code: "SOURCE_UNREADABLE", message: "简历正文读取失败，请更换文件或粘贴文本后重试。" };
  }
}
