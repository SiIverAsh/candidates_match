/** Mentors' job titles and qualifications describe another person, not the candidate. */
export function withoutMentorAnnotations(value: string): string {
  return value.replace(/[（(]\s*(?:合作导师|导师|指导教师|指导老师|PI|supervisor|mentor|advisor|adviser)\s*[:：][^）)]*[）)]/giu, "")
    .replace(/(?:[-—–]\s*)?(?:合作导师|导师|指导教师|指导老师)\s*[:：]?\s*[^/|，,\n]+(?=\/|[|，,\n]|$)/gu, "").trim();
}
