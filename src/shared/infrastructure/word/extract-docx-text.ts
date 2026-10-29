import JSZip from "jszip";
import { decodeHtmlEntities } from "./html-text";

export function wordXmlText(xml: string): string {
  // Paragraph and cell boundaries matter: simply stripping tags merges adjacent
  // runs and table fields, while deleted revision text must not enter the profile.
  return decodeHtmlEntities(xml
    .replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/gu, "")
    .replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/gu, "")
    .replace(/<w:tab\b[^>]*\/>/gu, "\t")
    .replace(/<w:(?:br|cr)\b[^>]*\/>/gu, "\n")
    .replace(/<\/w:p>/gu, "\n")
    .replace(/<\/w:tc>/gu, "\t")
    .replace(/<\/w:tr>/gu, "\n")
    .replace(/<[^>]+>/gu, ""));
}

export async function extractDocxText(bytes: Uint8Array, warnings: string[] = []): Promise<string> {
  const archive = await JSZip.loadAsync(bytes);
  const document = archive.file("word/document.xml");
  if (!document) throw new Error("DOCX_MAIN_DOCUMENT_MISSING");
  const headers = Object.keys(archive.files).filter(name => /^word\/header\d+\.xml$/u.test(name)).sort();
  const parts = await Promise.all([...headers.map(name => archive.file(name)!), document].map(async file => wordXmlText(await file.async("string"))));
  const text = [...new Set(parts.filter(part => part.trim()))].join("\n");
  const media = Object.keys(archive.files).filter(name => /^word\/media\//u.test(name) && !archive.files[name].dir);
  if (!text.trim() && media.length) throw new Error("TEXT_LAYER_MISSING");
  const mainXml = await document.async("string");
  const hasLargeDrawing = [...mainXml.matchAll(/<(?:wp:extent|a:ext)\b[^>]*>/gu)].some(match => {
    const width = Number(match[0].match(/\bcx="(\d+)"/u)?.[1] ?? 0);
    const height = Number(match[0].match(/\bcy="(\d+)"/u)?.[1] ?? 0);
    return width > 3_000_000 && height > 3_000_000;
  });
  if (media.length && (text.replace(/\s/gu, "").length < 180 || hasLargeDrawing)) warnings.push("Word 文档包含较大图片或可读取文字较少；图片内文字未被读取，请对照原文件补充。");
  return text;
}
