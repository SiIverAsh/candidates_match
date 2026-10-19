import { BATCH_LIMITS, BatchInputError, type BatchEvent, type BatchItemResult } from "../domain/models";
import type { BatchActor, BatchDependencies, BatchFile } from "./ports";
import { CANDIDATE_WORKBOOK_LIMITS, type WorkbookCandidateRow } from "../domain/workbook";

export type BatchCommand =
  | { kind: "import"; files: BatchFile[]; matchAfterImport: boolean }
  | { kind: "workbook"; rows: WorkbookCandidateRow[]; matchAfterImport: boolean }
  | { kind: "match"; queryIds: string[] };

export function validateBatch(command: BatchCommand): void {
  if (command.kind === "import") {
    if (!command.files.length || command.files.length > BATCH_LIMITS.maxFiles) throw new BatchInputError(`每批请选择 1～${BATCH_LIMITS.maxFiles} 份简历。`);
    if (command.files.reduce((total, file) => total + file.size, 0) > BATCH_LIMITS.maxTotalBytes) throw new BatchInputError("每批文件总大小不能超过 25 MB。");
  } else if (command.kind === "workbook") {
    if (!command.rows.length || command.rows.length > CANDIDATE_WORKBOOK_LIMITS.maxRows) throw new BatchInputError("Excel 每批需包含 1～1,000 位候选人。");
  } else {
    if (!command.queryIds.length || command.queryIds.length > BATCH_LIMITS.maxQueryIds) throw new BatchInputError(`每批请选择 1～${BATCH_LIMITS.maxQueryIds} 位候选人。`);
    if (new Set(command.queryIds).size !== command.queryIds.length) throw new BatchInputError("同一批次不能重复选择候选人。");
  }
}

function matchItem(item: BatchItemResult, actorId: string, dependencies: BatchDependencies): BatchItemResult {
  const result = dependencies.match(item.queryId!, actorId);
  if (result.kind !== "matched") return { ...item, status: result.kind === "no_employee_version" ? "NEEDS_DATA" : "FAILED", message: result.message };
  if (result.run.status === "SKIPPED_INSUFFICIENT") return { ...item, status: "NEEDS_INPUT", message: "经历信息不足，请补充简历后重试。" };
  if (item.workbookRow) {
    item = { ...item, employeeContacts: result.run.results.map(({ employeeId, name, email, currentDepartment, currentTitle, confidence, score, rank }) => ({ employeeId, name, email, currentDepartment, currentTitle, confidence, score, rank })) };
  }
  return { ...item, status: result.run.resultCount ? "MATCHED" : "NO_RESULTS", resultCount: result.run.resultCount, message: result.run.resultCount ? `找到 ${result.run.resultCount} 位可能认识的内部同事` : "已完成匹配，未找到有共同经历的内部同事。" };
}

export async function* processBatch(command: BatchCommand, actor: BatchActor, dependencies: BatchDependencies, signal?: AbortSignal): AsyncGenerator<BatchEvent> {
  validateBatch(command);
  const total = command.kind === "import" ? command.files.length : command.kind === "workbook" ? command.rows.length : command.queryIds.length;
  dependencies.record(actor.id, command.kind === "match" ? "MATCH_STARTED" : command.kind === "workbook" ? "WORKBOOK_IMPORT_STARTED" : "IMPORT_STARTED");
  yield { type: "start", total };
  let completed = 0;
  for (let index = 0; index < total; index++) {
    await dependencies.yieldControl();
    if (signal?.aborted) break;
    const row = command.kind === "workbook" ? command.rows[index] : null;
    let item: BatchItemResult = { index, label: row ? `${row.sheetName ? `${row.sheetName} · ` : ""}第 ${row.rowNumber} 行 · ${row.name || "未填写姓名"}` : command.kind === "import" ? command.files[index].name : `候选人 ${index + 1}`, queryId: null, status: "FAILED", message: "处理失败，请重试。", resultCount: 0 };
    if (row) item.workbookRow = { sheetName: row.sheetName ?? "", rowNumber: row.rowNumber, candidateName: row.name };
    try {
      if (row?.error) {
        item.message = row.error;
      } else if (command.kind !== "match") {
        const submitted = await dependencies.submit({ actor, file: command.kind === "import" ? command.files[index] : null, text: row?.text ?? null, textOrigin: row ? "WORKBOOK_ROW" : undefined });
        if (submitted.kind !== "accepted") {
          item.message = submitted.message;
        } else {
          item.queryId = submitted.query.id;
          const parsing = await dependencies.parse(item.queryId, actor.id);
          if (parsing.kind !== "profile") item.message = parsing.message;
          else if (parsing.profile.parseStatus === "FAILED" || parsing.profile.parseStatus === "INSUFFICIENT") {
            item = { ...item, status: "NEEDS_INPUT", message: "已保存简历，但无法提取足够经历；请打开详情检查或重新解析。" };
          } else {
            item = { ...item, status: "IMPORTED", message: parsing.profile.parseStatus === "PARTIAL" ? "已导入并解析，部分经历信息缺失。" : "已导入并解析。" };
            if (command.matchAfterImport) item = matchItem(item, actor.id, dependencies);
          }
        }
      } else {
        const queryId = command.queryIds[index];
        if (!dependencies.findQuery(queryId, actor.id)) item.message = "候选人不存在、已过期或无权访问。";
        else {
          item.queryId = queryId;
          let profile = dependencies.findProfile(queryId, actor.id);
          if (!profile) {
            const parsed = await dependencies.parse(queryId, actor.id);
            if (parsed.kind === "profile") profile = parsed.profile;
          }
          item.label = profile?.candidateName ?? item.label;
          item = profile ? matchItem(item, actor.id, dependencies) : { ...item, message: "画像生成失败，请在详情中重新解析。" };
        }
      }
    } catch {
      item = { ...item, status: "FAILED", message: item.queryId ? "简历已保存，后续处理失败；请从详情页重试，无需重复导入。" : "本条处理失败，请重试。" };
    }
    completed++;
    yield { type: "item", item };
  }
  dependencies.record(actor.id, completed === total ? "COMPLETED" : "STOPPED");
  yield { type: "done", completed };
}
