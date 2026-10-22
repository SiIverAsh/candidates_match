import type { DatabaseSync } from "node:sqlite";
import { matchesSearch } from "../../domain/text-search";

export function registerTextSearch(database: DatabaseSync): void {
  database.function("text_search_matches", { deterministic: true, varargs: true }, (query, ...fields) =>
    matchesSearch(String(query ?? ""), fields.map(value => String(value ?? ""))) ? 1 : 0);
}
