import { auditModule } from "./audit";
import { authModule } from "./auth";
import { candidateIntakeModule } from "./candidate-intake";
import { employeeDataModule } from "./employee-data";
import { evaluationModule } from "./evaluation";
import { matchingModule } from "./matching";
import { resultsModule } from "./results";
import { resumeParserModule } from "./resume-parser";

export const productModules = [
  authModule,
  employeeDataModule,
  candidateIntakeModule,
  resumeParserModule,
  matchingModule,
  resultsModule,
  auditModule,
  evaluationModule,
] as const;

export type { ModuleStage, ProductModule } from "./module.types";
