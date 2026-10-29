// EMR_EXTTEXTOUTW / EmrText layout follows Microsoft's MS-EMF specification.
// Glyph-index strings are deliberately excluded: they are not Unicode text.
export function extractEmfText(bytes: Uint8Array): string {
  const data = Buffer.from(bytes);
  const lines: string[] = [];
  let previousY: number | undefined;
  for (let offset = 0; offset + 8 <= data.length;) {
    const type = data.readUInt32LE(offset), size = data.readUInt32LE(offset + 4);
    if (size < 8 || offset + size > data.length) break;
    if (type === 84 && size >= 76) {
      const length = data.readUInt32LE(offset + 44), start = data.readUInt32LE(offset + 48), options = data.readUInt32LE(offset + 52);
      if (!(options & 0x10) && start >= 76 && start + length * 2 <= size) {
        const y = data.readInt32LE(offset + 40);
        const text = data.subarray(offset + start, offset + start + length * 2).toString("utf16le");
        if (text.trim()) {
          lines.push(previousY === y ? text : `\n${text}`);
          previousY = y;
        }
      }
    }
    offset += size;
  }
  return lines.join("").trim();
}
