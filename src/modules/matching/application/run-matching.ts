import type { MatchRun } from "../domain/models";
import type { MatchingDependencies } from "./ports";

export type RunMatchingResult =
  | { kind: "matched"; run: MatchRun }
  | { kind: "no_employee_version"; message: string }
  | { kind: "not_found"; message: string }
  | { kind: "persistence_failed"; message: string };

export function runMatching(
  queryId: string,
  requestedBy: string,
  dependencies: MatchingDependencies,
): RunMatchingResult {
  const createdAt = dependencies.now().toISOString();
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
    dependencies.repository.saveRun(run, requestedBy);
    return { kind: "matched", run };
  } catch {
    return { kind: "persistence_failed", message: "匹配结果暂时无法保存，请稍后重试。" };
  }
}

export function getMatchRun(
  queryId: string,
  requestedBy: string,
  dependencies: Pick<MatchingDependencies, "repository" | "now">,
): MatchRun | null {
  return dependencies.repository.findRun(
    queryId,
    requestedBy,
    dependencies.now().toISOString(),
  );
}
