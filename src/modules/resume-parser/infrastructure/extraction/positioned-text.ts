export interface PositionedText { text: string; x: number; y: number; width: number; height: number }

function removeOverprintedText(items: PositionedText[]): PositionedText[] {
  const byText = new Map<string, PositionedText[]>();
  const result: PositionedText[] = [];
  for (const item of items) {
    const previous = byText.get(item.text) ?? [];
    // Some PDF producers simulate bold by drawing the same text twice with a
    // sub-point offset. Require identical content and nearly identical bounds;
    // repeated names, dates or glyphs elsewhere on the page remain untouched.
    const overprinted = previous.some(other =>
      Math.abs(other.x - item.x) <= 0.5 && Math.abs(other.y - item.y) <= 0.5 &&
      Math.abs(other.width - item.width) <= 0.5 && Math.abs(other.height - item.height) <= 0.5);
    if (overprinted) continue;
    previous.push(item);
    byText.set(item.text, previous);
    result.push(item);
  }
  return result;
}

function renderRows(items: PositionedText[]): string {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: Array<{ y: number; height: number; items: PositionedText[] }> = [];
  for (const item of sorted) {
    const row = rows.at(-1);
    if (row && Math.abs(item.y - row.y) <= Math.max(2, Math.min(row.height, item.height) * 0.3)) row.items.push(item);
    else rows.push({ y: item.y, height: item.height, items: [item] });
  }
  return rows.map(row => row.items.sort((a, b) => a.x - b.x).map((item, index) => {
    const previous = row.items[index - 1];
    if (!previous) return item.text;
    const gap = item.x - previous.x - previous.width;
    const height = Math.max(previous.height, item.height);
    // Small positioning gaps between Chinese glyph runs are not word breaks.
    const adjacentChinese = /\p{Script=Han}$/u.test(previous.text) && /^\p{Script=Han}/u.test(item.text);
    const space = gap > height * 0.8 ? "   " : gap > 0.5 && !(adjacentChinese && gap < height * 0.25) ? " " : "";
    return space + item.text;
  }).join("")).join("\n");
}

export function renderPositionedText(inputItems: PositionedText[], pageWidth: number, pageHeight: number): string {
  const items = removeOverprintedText(inputItems);
  // Split only a persistent empty gutter with substantial prose on both sides.
  // A date column or occasional aligned labels should stay on the same row.
  for (let divider = pageWidth * 0.3; divider <= pageWidth * 0.65; divider += 8) {
    const crossing = items.filter(item => item.x < divider + 8 && item.x + item.width > divider - 8);
    if (crossing.some(item => item.y >= pageHeight * 0.2)) continue;
    const cutoff = crossing.length ? Math.max(...crossing.map(item => item.y + item.height)) : -Infinity;
    const header = items.filter(item => item.y <= cutoff);
    const body = items.filter(item => item.y > cutoff);
    const left = body.filter(item => item.x < divider);
    const right = body.filter(item => item.x >= divider);
    const leftText = renderRows(left), rightText = renderRows(right);
    if (leftText.split("\n").length < 12 || rightText.split("\n").length < 12) continue;
    if (Math.min(leftText.length, rightText.length) < (leftText.length + rightText.length) * 0.18) continue;
    const datesOrLabels = (text: string) => text.split("\n").filter(line => line.replace(/[\d\s./–—~至今到年年月日()-]/gu, "").length < 4).length / text.split("\n").length;
    if (datesOrLabels(leftText) > 0.5 || datesOrLabels(rightText) > 0.5) continue;
    return [renderRows(header), leftText, rightText].filter(Boolean).join("\n\n");
  }
  return renderRows(items);
}
