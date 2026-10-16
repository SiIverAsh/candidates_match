export const CANDIDATE_INTAKE_POLICY = {
  maxFileBytes: 5 * 1024 * 1024,
  minTextCharacters: 80,
  maxTextCharacters: 100_000,
  retentionDays: 7,
  allowedExtensions: ["pdf", "docx", "txt"],
} as const;

export type CandidateTextIssueCode =
  | "TEXT_REQUIRED"
  | "TEXT_TOO_SHORT"
  | "TEXT_TOO_LONG"
  | "INSUFFICIENT_CONTEXT";

export type CandidateTextValidation =
  | { ok: true; text: string }
  | { ok: false; code: CandidateTextIssueCode; message: string };

const RESUME_SIGNAL = /(?:工作经历|任职|公司|职位|教育经历|学历|学校|大学|学院|专业|experience|employment|company|education|university|college|school)/iu;

export function validateCandidateText(input: string): CandidateTextValidation {
  const text = input.replaceAll("\u0000", "").trim();
  if (!text) {
    return { ok: false, code: "TEXT_REQUIRED", message: "请粘贴候选人简历文本。" };
  }
  if (text.length < CANDIDATE_INTAKE_POLICY.minTextCharacters) {
    return {
      ok: false,
      code: "TEXT_TOO_SHORT",
      message: `文本至少需要 ${CANDIDATE_INTAKE_POLICY.minTextCharacters} 个字符，并包含工作或教育经历。`,
    };
  }
  if (text.length > CANDIDATE_INTAKE_POLICY.maxTextCharacters) {
    return {
      ok: false,
      code: "TEXT_TOO_LONG",
      message: `文本不能超过 ${CANDIDATE_INTAKE_POLICY.maxTextCharacters.toLocaleString("zh-CN")} 个字符。`,
    };
  }
  if (!RESUME_SIGNAL.test(text)) {
    return {
      ok: false,
      code: "INSUFFICIENT_CONTEXT",
      message: "未发现工作或教育经历线索，请补充公司、职位、学校或专业信息。",
    };
  }
  return { ok: true, text };
}

export function candidateExpiry(submittedAt: Date): string {
  return new Date(
    submittedAt.getTime() + CANDIDATE_INTAKE_POLICY.retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
}
