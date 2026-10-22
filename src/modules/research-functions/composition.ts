import { classifyResearchFunctions } from "./domain/classify-functions";
import type { ResearchWorkSource } from "./domain/models";
import { researchTaxonomy } from "./infrastructure/taxonomy";

export const researchFunctions = {
  classify: (work: ResearchWorkSource[]) => classifyResearchFunctions(work, researchTaxonomy),
};
