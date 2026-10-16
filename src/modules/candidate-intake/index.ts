import type { ProductModule } from "../module.types";

export const candidateIntakeModule: ProductModule = {
  id: "candidate-intake",
  name: "候选人资料提交",
  stage: "core",
  description: "接收单份简历文件或简历文本并创建查询。",
};

export type { CandidateQuery, CandidateReadiness } from "./domain/models";
export type { SubmitCandidateResult } from "./application/submit-candidate";
