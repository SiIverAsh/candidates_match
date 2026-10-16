import { candidateExpiry, validateCandidateText } from "../domain/policies";
import type { CandidateQuery, CandidateSourcePayload } from "../domain/models";
import type {
  CandidateActor,
  CandidateFileInput,
  CandidateIntakeDependencies,
} from "./ports";

export interface SubmitCandidateCommand {
  actor: CandidateActor;
  file: CandidateFileInput | null;
  text: string | null;
}

export type SubmitCandidateResult =
  | { kind: "accepted"; query: CandidateQuery }
  | { kind: "rejected"; code: string; message: string }
  | { kind: "persistence_failed"; message: string };

export async function submitCandidate(
  command: SubmitCandidateCommand,
  dependencies: CandidateIntakeDependencies,
): Promise<SubmitCandidateResult> {
  const hasFile = Boolean(command.file);
  const hasText = Boolean(command.text?.trim());
  if (hasFile === hasText) {
    return {
      kind: "rejected",
      code: "CHOOSE_ONE_SOURCE",
      message: "请只选择一种输入方式：上传文件或粘贴文本。",
    };
  }

  const readiness = dependencies.employeeVersions.readiness();

  let payload: CandidateSourcePayload;
  if (command.file) {
    const prepared = await dependencies.files.prepare(command.file);
    if (!prepared.ok) {
      return { kind: "rejected", code: prepared.code, message: prepared.message };
    }
    payload = prepared.payload;
  } else {
    const validation = validateCandidateText(command.text ?? "");
    if (!validation.ok) {
      return { kind: "rejected", code: validation.code, message: validation.message };
    }
    payload = { sourceType: "TEXT", sourceFormat: "plain-text", text: validation.text };
  }

  const submittedAt = dependencies.now();
  const query: CandidateQuery = {
    id: `qry-${dependencies.createId()}`,
    submittedBy: command.actor.id,
    submittedAt: submittedAt.toISOString(),
    employeeVersionId: readiness.activeVersion?.id ?? null,
    sourceType: payload.sourceType,
    sourceFormat: payload.sourceFormat,
    status: "QUEUED_FOR_PARSING",
    expiresAt: candidateExpiry(submittedAt),
  };

  try {
    dependencies.repository.purgeExpired(query.submittedAt);
    dependencies.repository.create(query, payload, command.actor);
    return { kind: "accepted", query };
  } catch {
    return { kind: "persistence_failed", message: "提交暂时无法保存，请稍后重试。" };
  }
}
