export type ModuleStage = "foundation" | "core" | "validation";

export interface ProductModule {
  id: string;
  name: string;
  stage: ModuleStage;
  description: string;
}
