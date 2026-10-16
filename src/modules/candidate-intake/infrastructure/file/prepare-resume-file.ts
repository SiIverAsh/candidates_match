import JSZip from "jszip";

import type {
  CandidateFileInput,
  CandidateFilePreparationResult,
} from "../../application/ports";
import { CANDIDATE_INTAKE_POLICY, validateCandidateText } from "../../domain/policies";

const MIME_TYPES: Record<string, string[]> = {
  pdf: ["application/pdf"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  txt: ["text/plain"],
};

function extensionOf(name: string): string {
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index + 1).toLowerCase();
}

function beginsWith(bytes: Uint8Array, value: string): boolean {
  return value.split("").every(
    (character, index) => bytes[index] === character.charCodeAt(0),
  );
}

async function isDocx(bytes: Uint8Array): Promise<boolean> {
  try {
    const archive = await JSZip.loadAsync(bytes);
    const contentTypes = archive.file("[Content_Types].xml");
    if (!contentTypes || !archive.file("word/document.xml")) return false;
    const xml = await contentTypes.async("string");
    return xml.includes(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
    );
  } catch {
    return false;
  }
}

export async function prepareResumeFile(
  file: CandidateFileInput,
): Promise<CandidateFilePreparationResult> {
  const extension = extensionOf(file.name);
  if (!CANDIDATE_INTAKE_POLICY.allowedExtensions.includes(extension as never)) {
    return {
      ok: false,
      code: "UNSUPPORTED_FILE_TYPE",
      message: "仅支持 PDF、DOCX 或 UTF-8 TXT 文件。",
    };
  }
  if (file.size <= 0) {
    return { ok: false, code: "EMPTY_FILE", message: "文件为空，请重新选择。" };
  }
  if (file.size > CANDIDATE_INTAKE_POLICY.maxFileBytes) {
    return { ok: false, code: "FILE_TOO_LARGE", message: "文件不能超过 5 MB。" };
  }
  const acceptedMimes = MIME_TYPES[extension];
  if (
    file.type &&
    file.type !== "application/octet-stream" &&
    !acceptedMimes.includes(file.type)
  ) {
    return {
      ok: false,
      code: "MIME_MISMATCH",
      message: "文件扩展名与实际类型不一致。",
    };
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength !== file.size || bytes.byteLength > CANDIDATE_INTAKE_POLICY.maxFileBytes) {
    return { ok: false, code: "FILE_SIZE_MISMATCH", message: "文件大小校验失败。" };
  }

  if (extension === "pdf") {
    const tail = new TextDecoder("latin1").decode(
      bytes.slice(Math.max(0, bytes.length - 2048)),
    );
    if (!beginsWith(bytes, "%PDF-") || !tail.includes("%%EOF")) {
      return { ok: false, code: "CORRUPTED_PDF", message: "PDF 文件损坏或格式无效。" };
    }
  }
  if (extension === "docx" && !(await isDocx(bytes))) {
    return { ok: false, code: "CORRUPTED_DOCX", message: "DOCX 文件损坏或格式无效。" };
  }
  if (extension === "txt") {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return {
        ok: false,
        code: "INVALID_TEXT_ENCODING",
        message: "TXT 文件必须使用 UTF-8 编码。",
      };
    }
    const validation = validateCandidateText(text);
    if (!validation.ok) {
      return { ok: false, code: validation.code, message: validation.message };
    }
  }

  return {
    ok: true,
    payload: {
      sourceType: "FILE",
      sourceFormat: extension as "pdf" | "docx" | "txt",
      mimeType: acceptedMimes[0],
      bytes,
    },
  };
}
