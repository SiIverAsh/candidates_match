import type { FunctionPriority, ResearchFunctionAssessment } from "../../research-functions/domain/models";

export const CANDIDATE_FUNCTION_FILTERS = [
  "discovery_biology", "screening", "molecular_science", "medicinal_chemistry",
  "biologics_discovery", "in_vivo_pharmacology", "computational_discovery",
  "UNASSESSED", "INSUFFICIENT", "AMBIGUOUS",
] as const;

export const CANDIDATE_FUNCTION_LABELS: Record<(typeof CANDIDATE_FUNCTION_FILTERS)[number], string> = {
  discovery_biology: "发现生物学 / Discovery Biology",
  screening: "筛选 / Screening",
  molecular_science: "分子与结构科学 / Molecular Science",
  medicinal_chemistry: "药物化学 / Medicinal Chemistry",
  biologics_discovery: "抗体与生物药发现 / Biologics Discovery",
  in_vivo_pharmacology: "体内药效 / In Vivo Pharmacology",
  computational_discovery: "计算生物学 / Computational Biology",
  UNASSESSED: "职能信息暂不可用",
  INSUFFICIENT: "职能证据不足",
  AMBIGUOUS: "多个方向接近，待复核",
};

export interface PossibleFunctionsSummary {
  status: ResearchFunctionAssessment["status"] | "UNASSESSED";
  historical: boolean;
  message: string;
  functions: Pick<FunctionPriority, "functionId" | "name" | "rank" | "score" | "confidence" | "eligible">[];
}

export function summarizePossibleFunctions(assessment?: ResearchFunctionAssessment | null): PossibleFunctionsSummary {
  return {
    status: assessment?.status ?? "UNASSESSED",
    historical: assessment?.historical ?? false,
    message: assessment?.summary ?? "简历职能信息暂时无法读取，请刷新重试。",
    functions: assessment?.priorities.filter(item => item.score > 0).slice(0, 3)
      .map(({ functionId, name, rank, score, confidence, eligible }) => ({ functionId, name, rank, score, confidence, eligible })) ?? [],
  };
}

export function possibleFunctionFilterValues(summary: PossibleFunctionsSummary): string[] {
  return [summary.status, ...summary.functions.map(item => item.functionId)];
}

export function possibleFunctionSearchFields(assessment?: ResearchFunctionAssessment): string[] {
  const summary = summarizePossibleFunctions(assessment);
  return [summary.message, ...summary.functions.map(item => item.name),
    ...possibleFunctionFilterValues(summary).map(value => CANDIDATE_FUNCTION_LABELS[value as keyof typeof CANDIDATE_FUNCTION_LABELS] ?? value)];
}
