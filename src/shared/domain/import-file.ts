export function importFileKind(name: string): "resume" | "workbook" | null {
  if (/\.xlsx$/iu.test(name)) return "workbook";
  if (/\.(pdf|doc|docx|txt)$/iu.test(name)) return "resume";
  return null;
}
