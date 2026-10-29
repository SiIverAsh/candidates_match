export const RESUME_FILE_FORMATS = ["pdf", "doc", "docx", "txt", "html", "pptx", "jpg", "jpeg", "png", "msg"] as const;
export type ResumeFileFormat = (typeof RESUME_FILE_FORMATS)[number];
export const RESUME_FILE_EXTENSIONS = ["pdf", "doc", "docx", "txt", "html", "htm", "pptx", "msg"] as const;
export const MAX_RESUME_FILE_BYTES = 50 * 1024 * 1024;

export function importFileKind(name: string): "resume" | "workbook" | null {
  if (/\.xlsx$/iu.test(name)) return "workbook";
  const extension = name.split(".").at(-1)?.toLowerCase();
  if (name.includes(".") && RESUME_FILE_EXTENSIONS.some(format => format === extension)) return "resume";
  return null;
}

export function resumeImportFileIssue(file: { name: string; size: number }): string | null {
  const kind = importFileKind(file.name);
  if (kind === "workbook") return "Excel 请单独导入，文件夹导入仅处理单人简历。";
  if (/\.(?:jpe?g|png)$/iu.test(file.name)) return "图片简历需要文字识别；请提供带可选文字的 PDF、Word 或文本文件。";
  if (!kind) return "暂不支持该文件格式，请转换为 PDF、Word、TXT、HTML、PPTX 或 MSG。";
  if (!file.size) return "文件为空。";
  if (file.size > MAX_RESUME_FILE_BYTES) return "简历文件不能超过 50 MB。";
  return null;
}
