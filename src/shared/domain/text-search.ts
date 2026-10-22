function normalizeSearchText(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, "");
}

export function matchesSearch(query: string, fields: readonly string[]): boolean {
  const terms = query.normalize("NFKC").toLowerCase().split(/[\s,、;]+/u).filter(Boolean);
  if (!terms.length) return true;
  const values = fields.map(normalizeSearchText);
  return terms.every(term => values.some(value => value.includes(term)));
}
