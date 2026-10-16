import type { ProductModule } from "../module.types";

export const resultsModule: ProductModule = {
  id: "results",
  name: "可解释结果浏览",
  stage: "core",
  description: "按置信度展示全部具有事实依据的内部同事。",
};

export {
  CONFIDENCE_LABELS,
  CONFIDENCE_ORDER,
  groupMatchResults,
  isGroupInitiallyOpen,
} from "./domain/group-results";
export type { ResultGroup } from "./domain/group-results";
