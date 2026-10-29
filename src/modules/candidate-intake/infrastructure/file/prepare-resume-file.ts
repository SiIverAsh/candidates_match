import JSZip from "jszip";
import type { ResumeFileFormat } from "../../../../shared/domain/import-file";
import { extractMsgAttachment } from "../../../../shared/infrastructure/word/extract-msg-attachment";
import { extractHtmlDocument } from "../../../../shared/infrastructure/word/html-text";
import { extractDocText } from "../../../../shared/infrastructure/word/extract-doc-text";

import type {
  CandidateFileInput,
  CandidateFilePreparationResult,
} from "../../application/ports";
import { CANDIDATE_INTAKE_POLICY, validateCandidateText } from "../../domain/policies";

const MIME_TYPES: Record<string, string[]> = {
  pdf: ["application/pdf"],
  doc: ["application/msword", "application/doc", "application/vnd.ms-word"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  txt: ["text/plain"],
  msg: ["application/vnd.ms-outlook"],
  html: ["text/html", "application/xhtml+xml"],
  pptx: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"],
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

async function isDoc(bytes: Uint8Array): Promise<boolean> {
  try {
    await extractDocText(bytes);
    return true;
  } catch (error) {
    // An image-only Word document is a valid container; extraction reports its
    // missing text layer separately instead of calling the file corrupted.
    return error instanceof Error && error.message === "TEXT_LAYER_MISSING";
  }
}

export async function prepareResumeFile(
  file: CandidateFileInput,
): Promise<CandidateFilePreparationResult> {
  const originalExtension = extensionOf(file.name);
  const extension = originalExtension === "htm" ? "html" : originalExtension;
  if (["jpg", "jpeg", "png"].includes(extension)) return { ok: false, code: "IMAGE_ONLY", message: "图片简历没有可直接读取的文字，请提供带可选择文字的 PDF、Word 或粘贴简历文本。" };
  if (!CANDIDATE_INTAKE_POLICY.allowedExtensions.includes(extension as never)) {
    return {
      ok: false,
      code: "UNSUPPORTED_FILE_TYPE",
      message: "仅支持 PDF、DOC、DOCX、PPTX、HTML、MSG 或 UTF-8 TXT 文件。",
    };
  }
  if (file.size <= 0) {
    return { ok: false, code: "EMPTY_FILE", message: "文件为空，请重新选择。" };
  }
  if (file.size > CANDIDATE_INTAKE_POLICY.maxFileBytes) {
    return { ok: false, code: "FILE_TOO_LARGE", message: `文件不能超过 ${CANDIDATE_INTAKE_POLICY.maxFileBytes / 1024 / 1024} MB。` };
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
  if (extension === "doc" && !(await isDoc(bytes))) {
    return { ok: false, code: "CORRUPTED_DOC", message: "DOC 文件损坏、加密或格式无效，请另存为 DOCX 或粘贴简历文本。" };
  }
  if (extension === "docx" && !(await isDocx(bytes))) {
    return { ok: false, code: "CORRUPTED_DOCX", message: "DOCX 文件损坏或格式无效。" };
  }
  if (extension === "msg") {
    try {
      const attachment = await extractMsgAttachment(bytes);
      const checked = await prepareResumeFile({ name: `attachment.${attachment.format}`, type: "", size: attachment.bytes.length, arrayBuffer: async () => Uint8Array.from(attachment.bytes).buffer });
      if (!checked.ok) return checked;
    } catch (error) {
      const multiple = error instanceof Error && error.message === "MSG_MULTIPLE_ATTACHMENTS";
      return { ok: false, code: multiple ? "MSG_MULTIPLE_ATTACHMENTS" : "MSG_NO_RESUME_ATTACHMENT", message: multiple ? "邮件包含多份文档附件，请分别导出简历后导入。" : "未找到可读取的简历附件，请从邮件中导出简历后导入。" };
    }
  }
  if (extension === "html") {
    try { extractHtmlDocument(bytes); }
    catch { return { ok: false, code: "CORRUPTED_HTML", message: "HTML 文件损坏或格式无效。" }; }
  }
  if (extension === "pptx") {
    let valid = false;
    try {
      const archive = await JSZip.loadAsync(bytes);
      valid = Boolean(archive.file("[Content_Types].xml") && archive.file("ppt/presentation.xml") && archive.file(/^ppt\/slides\/slide\d+\.xml$/u).length);
    } catch { /* Invalid ZIP archives are rejected below. */ }
    if (!valid) return { ok: false, code: "CORRUPTED_PPTX", message: "PPTX 文件损坏或格式无效。" };
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
      sourceFormat: extension as ResumeFileFormat,
      mimeType: acceptedMimes[0],
      bytes,
    },
  };
}
