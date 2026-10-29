import { createRequire } from "node:module";
import WordExtractor from "word-extractor";
import { extractDocxText } from "./extract-docx-text";
import { extractHtmlDocument } from "./html-text";

const require = createRequire(import.meta.url);
type WordDocument = Awaited<ReturnType<WordExtractor["extract"]>>;
interface LegacyExtractor {
  extract(reader: unknown): Promise<WordDocument>;
  writeParagraphProperties(bytes: Buffer, table: Buffer): void;
}
const WordOleExtractor = require("word-extractor/lib/word-ole-extractor") as new () => LegacyExtractor;
const BufferReader = require("word-extractor/lib/buffer-reader") as new (bytes: Buffer) => unknown;

class CompatibleWordExtractor extends WordOleExtractor {
  recoveredParagraphFormatting = false;
  override writeParagraphProperties(bytes: Buffer, table: Buffer): void {
    try { super.writeParagraphProperties(bytes, table); }
    catch (error) {
      // Some WPS files have malformed paragraph-format runs. Text pieces and
      // character/deletion properties have already been decoded by this point.
      // Recover only this range failure, never a broken text or character table.
      if (!(error instanceof RangeError) || (error as NodeJS.ErrnoException).code !== "ERR_OUT_OF_RANGE") throw error;
      this.recoveredParagraphFormatting = true;
    }
  }
}

export async function extractDocText(bytes: Uint8Array, warnings: string[] = []): Promise<string> {
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) return extractDocxText(bytes, warnings);
  if (!(bytes[0] === 0xd0 && bytes[1] === 0xcf)) return extractHtmlDocument(bytes);
  let document: WordDocument;
  try { document = await new WordExtractor().extract(Buffer.from(bytes)); }
  catch {
    const compatible = new CompatibleWordExtractor();
    document = await compatible.extract(new BufferReader(Buffer.from(bytes)));
    if (compatible.recoveredParagraphFormatting) warnings.push("旧版 Word 的部分段落格式损坏，已恢复正文，请核对表格分隔与经历字段。");
  }
  return [document.getHeaders(), document.getBody(), document.getTextboxes()].filter(Boolean).join("\n");
}
