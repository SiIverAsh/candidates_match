export const WORK_SECTION = /^(?:工作(?:与|及|和|\/|／)实习经历|工作经历|工作经验|职业经历|职业经验|任职经历|实习经历|实习经验|实习实践|实习|(?:research\s*(?:&|and)\s*)?(?:work(?:ing)?|professional|relevant|research|employment)\s+experiences?|(?:work|employment|career|professional)\s+history|(?:faculty\s+)?academic\s+appointments|postdoctoral\s+training|experiences?|employment|internship experiences?|internships?)(?=\s|[:：]|$|(?:19|20)\d{2})\s*[:：]?\s*(.*)$/iu;
export const EDUCATION_SECTION = /^(?:教育(?:及培训)?经历|教育(?:及培训)?背景|学习经历|学历|education(?:al)?(?:\s+(?:experiences?|background|history|qualifications|(?:and|&)\s*training))?|academic\s+(?:background|history|qualifications))(?=\s|[:：]|$|(?:19|20)\d{2})\s*[:：]?\s*(.*)$/iu;
export const MIXED_EXPERIENCE_SECTION = /^(?:教育(?:及|和|与|、)(?:工作|研究)经历|教育背景及工作经历|科研经历|研究经历|education\s*(?:and|&)\s*(?:work|research)\s*experiences?)\s*[:：]?$/iu;
export const OTHER_SECTION = /^(?:技能(?:及其他|、语言)?|专业技能(?:、任职及证书)?|个人技能|项目(?:经历|经验)(?:及成果)?|科研(?:项目|经历|成果)|研究方向|主要成果|学术成果|学工经历|发表文章|语言能力|附加信息|推荐理由|求职意向|个人简介|自我评价|荣誉奖励|奖励荣誉|校园实践|获奖|证书|兴趣爱好|(?:technical\s+|professional\s+|core\s+)?skills|(?:research\s+)?project\s+experiences?|(?:research\s+)?projects?|(?:professional\s+|research\s+)?summary(?:\s+of\s+qualifications)?|core\s+strengths?|profile|objective|certifications?|certificates?|(?:honors?[,\s]+)?awards?|grants\s+and\s+awards|(?:selected\s+)?publications?|research\s+articles?|research|bibliography|patents?(?:\s+of\s+invention)?(?:\s*\([^)]*\))?|professional\s+(?:organizations\s+and\s+society\s+memberships|affiliations\s*(?:&|and)\s*services)|presentations?|personal\s+statement|languages?|interests?|references?)(?:\s*[:：].*|\s*)$/iu;
export const EXPERIENCE_DESCRIPTION = /^(?:research\s+projects?|research\s+(?:topics?|details?)|responsibilities|achievements|supervisors?|mentors?)\s*[:：]/iu;
export const FUNDING_SECTION = /^(?:grants?(?:\s*(?:and|&|\/)\s*awards?)?|research\s+funding)\s*[:：]?$/iu;

export function isResumeSection(line: string): boolean {
  return MIXED_EXPERIENCE_SECTION.test(line) || WORK_SECTION.test(line) || EDUCATION_SECTION.test(line) || OTHER_SECTION.test(line) || FUNDING_SECTION.test(line) || EXPERIENCE_DESCRIPTION.test(line);
}

/** Only collapse typography when the result is a known section heading. */
export function cleanResumeLine(value: string): string {
  let line = value.trim().replace(/^[\s•●▪◦·*\-➢➤▶►◼■◆◇<>《》\uE000-\uF8FF]+/u, "").trim();
  line = line.replace(/^[lo]\s+(?=(?:19|20)\d{2})/u, "").replace(/^\d{1,2}(?=(?:公司(?:名称)?|学校(?:名称)?|起止时间)\s*[:：])/u, "");
  const numbered = line.replace(/^(?:\d{1,2}[.、)]|\(\d{1,2}\))\s*/u, "");
  if (isResumeSection(numbered)) line = numbered;
  if (/^\d+[.、]\s*如果.*项目经历/u.test(line)) line = "项目经历";
  if (/^(?:教育经历与荣誉|教育与培训经历)\s*[:：]?$/u.test(line)) line = "教育经历";
  if (/^教育\s*[:：]?$/u.test(line)) line = "教育背景";
  if (!isResumeSection(line) && /^[\p{Script=Han}]{1,8}工作经历\s*[:：]?$/u.test(line)) line = "工作经历";
  if (/^(?:发表论文|论文发表|项目成果|学生活动|校内职位)\s*[:：]?$/u.test(line)) line = "科研成果";
  if (/^academic\s+achievements?\s*[:：]?$/iu.test(line)) line = "Publications";
  const repeated = line.match(/^(.{2,24})\1[:：]?$/u);
  if (repeated && isResumeSection(repeated[1])) line = repeated[1];
  const bilingual = line.match(/^([\p{Script=Han}]{2,12})\s+([A-Za-z][A-Za-z &/-]+)$/u);
  if (bilingual && isResumeSection(bilingual[1]) && isResumeSection(bilingual[2])) line = bilingual[1];
  const compact = line.replace(/(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu, "");
  if (isResumeSection(compact) && /^(?:工作|教育|学习|职业|任职|实习|项目|科研|专业|个人|语言|研究|主要|发表|荣誉|校园|附加|推荐|求职|自我|获奖|证书|兴趣)/u.test(compact)) return compact;
  return line;
}
