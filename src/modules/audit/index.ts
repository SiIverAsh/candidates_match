import type { ProductModule } from "../module.types";

export const auditModule: ProductModule = {
  id: "audit",
  name: "安全审计与数据生命周期",
  stage: "foundation",
  description: "记录最小安全事件并执行候选人数据到期删除。",
};

export type {
  AuditActionType,
  AuditEventInput,
  CandidateRetentionResult,
  RetentionRun,
} from "./domain/models";
