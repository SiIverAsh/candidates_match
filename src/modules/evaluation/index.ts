import type { ProductModule } from "../module.types";

export const evaluationModule: ProductModule = {
  id: "evaluation",
  name: "质量校准与上线验证",
  stage: "validation",
  description: "运行离线标注集评估并执行 MVP 上线门禁。",
};

export { evaluateDataset, EvaluationVersionMismatchError } from "./application/evaluate-dataset";
export type {
  EvaluationCase,
  EvaluationDataset,
  EvaluationErrorCase,
  EvaluationReport,
  EvaluationVersions,
  PrototypeValidation,
  RelationshipScenario,
  ScenarioMetrics,
} from "./domain/models";
export {
  EvaluationDatasetValidationError,
  parseEvaluationDataset,
} from "./infrastructure/json/parse-dataset";
