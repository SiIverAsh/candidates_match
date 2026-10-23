import type { MatchRun } from "../domain/models";
import { isCurrentMatchRun } from "../domain/config";
import type { MatchingDependencies } from "./ports";

export type RunMatchingResult =
  | { kind: "matched"; run: MatchRun; reused?: boolean }
  | { kind: "no_employee_version"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "persistence_failed"; message: string };

export function runMatching(
  queryId: string,
  requestedBy: string,
  dependencies: MatchingDependencies,
): RunMatchingResult {
  const createdAt = dependencies.now().toISOString();
  const existing = dependencies.repository.findRun(queryId, requestedBy, createdAt);
  if (existing && isCurrentMatchRun(existing)) return { kind: "matched", run: existing, reused: true };

  const employeeVersionId = dependencies.repository.findActiveEmployeeVersion();
  const context = dependencies.repository.loadContext(queryId, requestedBy, createdAt, employeeVersionId);
  if (!context) {
    return {
      kind: "not_found",
      message: "候选人画像不存在、已过期或无权访问。",
    };
  }
  if (!context.employeeVersionId || context.employees.length === 0) {
    return { kind: "no_employee_version", message: "简历已解析。当前没有可用的员工数据，请联系管理员导入后重试匹配，无需重新提交简历。" };
  }
  const run = dependencies.engine.run(
    context,
    `match-${dependencies.createId()}`,
    createdAt,
  );
  try {
    const saved = dependencies.repository.saveRun(run, requestedBy);
    return { kind: "matched", run: saved, reused: saved.id !== run.id };
  } catch {
    return { kind: "persistence_failed", message: "匹配结果暂时无法保存，请稍后重试。" };
  }
}

export function getMatchRun(
  queryId: string,
  requestedBy: string,
  dependencies: MatchingDependencies,
): MatchRun | null {
  const existing = dependencies.repository.findRun(
    queryId,
    requestedBy,
    dependencies.now().toISOString(),
  );
  if (!existing || isCurrentMatchRun(existing)) return existing;
  const result = runMatching(queryId, requestedBy, dependencies);
  if (result.kind === "matched") return result.run;
  if (result.kind === "not_found") return null;
  throw new Error(result.message);
}
