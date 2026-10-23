import { normalizePersonEmail, normalizePersonProfileUrl, type PersonIdentity } from "../../../shared/domain/person-identity";

const NOT_NAME = /\b(?:curriculum|vitae|resume|profile|summary|experience|education|scientist|researcher|manager|director|university|college|institute|department|recruitment|international|building|consulting|confidential|candidate|report|interview|information)\b|简历|个人信息|基本信息|教育|工作|研究员|大学|学院|公司/iu;

export function inferResumeName(text: string): string | null {
  const lines = text.split(/\r?\n/u).map(line => line.trim()).filter(Boolean);
  const labelled = lines.slice(0, 40).map(line => line.match(/^(?:姓名|name|full name|candidate name)\s*[:：]\s*(.+)$/iu)?.[1]).find(Boolean);
  if (labelled) return labelled.trim();
  for (const line of lines.slice(0, 5)) {
    const name = line.replace(/\s*[,，]\s*(?:Ph\.?\s?D\.?|M\.?D\.?|MSc|博士|硕士).*$/iu, "").trim();
    if (name.length > 70 || NOT_NAME.test(name) || /[@\d/:：]/u.test(name)) continue;
    if (/^[\p{Script=Han}]{2,4}(?:\s+[A-Za-z][A-Za-z .'-]+)?$/u.test(name) ||
      /^[A-Za-z][A-Za-z'-]*(?:\s+(?:\([A-Za-z '-]+\)\s+)?[A-Za-z][A-Za-z'-]*){1,4}(?:\s*[（(][\p{Script=Han}]{2,4}[）)])?$/u.test(name)) return name;
  }
  return null;
}
export const RESUME_IDENTITY_FIELD = /^(?:邮箱|工作邮箱|电子邮箱|电子邮件|e-?mail|员工编号|工号|employee[_ ]?id|linkedin(?:\s+public)?(?:\s+url)?|profile[_ ]?url|领英(?:链接|主页)?|个人主页)\s*[:：]/iu;

export function extractResumeIdentity(text: string): PersonIdentity {
  const labelled = (labels: string) => [...text.matchAll(new RegExp(`^(?:${labels})[ \\t]*[:：][ \\t]*(.+)$`, "gimu"))].at(-1)?.[1]?.trim();
  const emailText = labelled("邮箱|工作邮箱|电子邮箱|电子邮件|e-?mail");
  const header = text.split(/\r?\n/u).slice(0, 20).join("\n");
  const email = normalizePersonEmail((emailText ?? header).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0]);
  const profile = labelled("linkedin(?:\\s+public)?(?:\\s+url)?|profile[_ ]?url|领英(?:链接|主页)?|个人主页")
    ?? text.match(/(?:https?:\/\/)?(?:[a-z]{2,3}\.|www\.)?linkedin\.com\/(?:in|pub)\/[^\s<>"，。]+/iu)?.[0]?.replace(/[).;,]+$/u, "");
  return {
    ...(email ? { email } : {}),
    ...(profile && normalizePersonProfileUrl(profile) ? { profileUrl: normalizePersonProfileUrl(profile) } : {}),
    ...(labelled("员工编号|工号|employee[_ ]?id") ? { employeeId: labelled("员工编号|工号|employee[_ ]?id") } : {}),
  };
}
