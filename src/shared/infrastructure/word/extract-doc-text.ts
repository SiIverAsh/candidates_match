import WordExtractor from "word-extractor";

export async function extractDocText(bytes: Uint8Array): Promise<string> {
  const document = await new WordExtractor().extract(Buffer.from(bytes));
  return [document.getHeaders(), document.getBody(), document.getTextboxes()]
    .filter(Boolean).join("\n");
}
