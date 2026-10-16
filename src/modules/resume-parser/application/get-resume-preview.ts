import type { ResumeParserDependencies } from "./ports";

export async function getResumePreview(queryId: string, requestedBy: string, dependencies: ResumeParserDependencies) {
  const source = dependencies.repository.findSource(queryId, requestedBy, dependencies.now().toISOString());
  if (!source) return null;
  const extracted = await dependencies.extractor.extract(source);
  return extracted.ok ? { text: extracted.text, sourceFormat: source.sourceFormat } : { text: null, sourceFormat: source.sourceFormat, message: extracted.message };
}
