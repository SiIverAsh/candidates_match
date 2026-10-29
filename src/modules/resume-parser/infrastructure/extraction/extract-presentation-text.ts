import { posix } from "node:path";
import { extractEmfText } from "./metafile-text";
import JSZip from "jszip";
import { decodeHtmlEntities } from "../../../../shared/infrastructure/word/html-text";

export async function extractPresentationText(bytes: Uint8Array, warnings: string[] = []): Promise<string> {
  const archive = await JSZip.loadAsync(bytes);
  let slides = Object.keys(archive.files).filter(name => /^ppt\/slides\/slide\d+\.xml$/u.test(name))
    .sort((a, b) => Number(a.match(/slide(\d+)/u)?.[1]) - Number(b.match(/slide(\d+)/u)?.[1]));
  if (!slides.length) throw new Error("PPTX_SLIDES_MISSING");
  const presentation = await archive.file("ppt/presentation.xml")?.async("string") ?? "";
  const presentationRels = await archive.file("ppt/_rels/presentation.xml.rels")?.async("string") ?? "";
  const targets = new Map<string, string>();
  for (const match of presentationRels.matchAll(/<Relationship\b[^>]*\/>/gu)) {
    const id = match[0].match(/\bId="([^"]+)"/u)?.[1], target = match[0].match(/\bTarget="([^"]+)"/u)?.[1];
    if (id && target && !/TargetMode="External"/u.test(match[0])) targets.set(id, posix.normalize(posix.join("ppt", target)));
  }
  const slideIds = [...presentation.matchAll(/<p:sldId\b[^>]*r:id="([^"]+)"/gu)].map(match => match[1]);
  const ordered = slideIds.map(id => targets.get(id)).filter((name): name is string => Boolean(name && slides.includes(name)));
  // ZIP archives can retain unreferenced slides. They are not in the actual
  // presentation and must not add stale or unrelated resume records.
  if (slideIds.length) {
    if (ordered.length !== slideIds.length) throw new Error("PPTX_SLIDE_RELATIONSHIP_INVALID");
    slides = ordered;
  }
  return (await Promise.all(slides.map(async name => {
    const xml = await archive.file(name)!.async("string");
    const native = decodeHtmlEntities(xml.replace(/<a:br\b[^>]*\/>/gu, "\n").replace(/<\/a:p>/gu, "\n").replace(/<[^>]+>/gu, ""));
    const rels = await archive.file(`ppt/slides/_rels/${posix.basename(name)}.rels`)?.async("string") ?? "";
    const embedded: string[] = [];
    for (const match of rels.matchAll(/<Relationship\b[^>]*\/>/gu)) {
      if (/TargetMode="External"/u.test(match[0])) continue;
      const target = match[0].match(/\bTarget="([^"]+)"/u)?.[1];
      if (!target) continue;
      const file = archive.file(posix.normalize(posix.join("ppt/slides", target)));
      if (!file) continue;
      if (/\.emf$/iu.test(target)) embedded.push(extractEmfText(await file.async("uint8array")));
      else if (/\.wmf$/iu.test(target)) warnings.push("幻灯片包含无法读取文字的 WMF 图形，请导出 PDF 后核对内容。");
      else if (native.trim().length < 80 && /\.(?:png|jpe?g)$/iu.test(target)) {
        const bytes = await file.async("uint8array");
        if (bytes.length > 100_000) warnings.push("幻灯片包含图片内容，当前仅提取可读取文字，请对照原文件补充。");
      }
    }
    if (!native.trim() && !embedded.some(value => value.trim())) warnings.push("部分幻灯片没有可读取的文字，请核对原文件。");
    return [native, ...embedded].filter(Boolean).join("\n");
  }))).join("\n\n");
}
