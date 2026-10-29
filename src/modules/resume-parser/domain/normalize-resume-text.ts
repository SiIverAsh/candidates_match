// PDF fonts sometimes encode a whole character with a CJK radical code point.
// NFKC handles Kangxi radicals but not these CJK Radicals Supplement forms.
// Equivalent unified ideographs: Unicode UCD EquivalentUnifiedIdeograph.txt
// https://www.unicode.org/Public/UCD/latest/ucd/EquivalentUnifiedIdeograph.txt
const RADICAL_EQUIVALENTS: Record<string, string> = {
  "⺠": "民", "⻄": "西", "⻅": "见", "⻆": "角", "⻉": "贝", "⻓": "长",
  "⻔": "门", "⻘": "青", "⻛": "风", "⻝": "食", "⻢": "马", "⻣": "骨",
  "⻩": "黄", "⻬": "齐", "⻮": "齿", "⻰": "龙",
};

export function normalizeResumeText(text: string): string {
  return text.normalize("NFKC").replace(/[\u2e80-\u2eff]/gu, character => RADICAL_EQUIVALENTS[character] ?? character);
}
