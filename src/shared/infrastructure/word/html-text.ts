const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", ndash: "–", mdash: "—", middot: "·", bull: "•" };

export function decodeHtmlEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (whole, entity: string) => {
    if (entity.startsWith("#")) {
      const point = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : whole;
    }
    return ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

export function htmlToText(html: string): string {
  return decodeHtmlEntities(html
    .replace(/<!--[\s\S]*?-->/gu, "")
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<br\b[^>]*\/?\s*>/giu, "\n")
    .replace(/<\/(?:p|div|tr|h[1-6]|li|section|article)\s*>/giu, "\n")
    .replace(/<\/(?:td|th)\s*>/giu, "\u0001")
    .replace(/<[^>]*>/gu, ""))
    // Collapse HTML whitespace while preserving the cell boundaries we inserted.
    .replace(/[ \t]+/gu, " ").replaceAll("\u0001", "\t").replace(/ *\n */gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}

export function decodeDocumentBytes(bytes: Uint8Array, encoding?: string): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  const header = Buffer.from(bytes.subarray(0, 2048)).toString("latin1");
  const charset = encoding ?? header.match(/charset\s*=\s*["']?([\w-]+)/iu)?.[1] ?? "utf-8";
  return new TextDecoder(charset).decode(bytes);
}

export function extractHtmlDocument(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const header = raw.split(/\r?\n\r?\n/u)[0].replace(/\r?\n[ \t]+/gu, " ");
  const boundary = header.match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/iu);
  if (!/^MIME-Version:|^Content-Type:\s*multipart\//imu.test(header) || !boundary) {
    const html = decodeDocumentBytes(bytes);
    if (!/<(?:html|body|div|p|table)\b/iu.test(html)) throw new Error("NOT_HTML_DOCUMENT");
    return htmlToText(html);
  }
  for (const part of raw.split(`--${boundary[1] ?? boundary[2]}`)) {
    const split = part.search(/\r?\n\r?\n/u);
    if (split < 0) continue;
    const headers = part.slice(0, split).replace(/\r?\n[ \t]+/gu, " ");
    if (!/Content-Type:\s*text\/html\b/iu.test(headers)) continue;
    const body = part.slice(split).replace(/^\r?\n\r?\n/u, "").replace(/\r?\n$/u, "");
    let decoded: Buffer;
    if (/Content-Transfer-Encoding:\s*base64/iu.test(headers)) decoded = Buffer.from(body.replace(/\s/gu, ""), "base64");
    else if (/Content-Transfer-Encoding:\s*quoted-printable/iu.test(headers)) decoded = Buffer.from(body.replace(/=\r?\n/gu, "").replace(/=([\da-f]{2})/giu, (_, hex: string) => String.fromCharCode(parseInt(hex, 16))), "latin1");
    else decoded = Buffer.from(body, "latin1");
    const encoding = headers.match(/charset\s*=\s*["']?([\w-]+)/iu)?.[1];
    return htmlToText(decodeDocumentBytes(decoded, encoding));
  }
  throw new Error("MHTML_BODY_MISSING");
}
