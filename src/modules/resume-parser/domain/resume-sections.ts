export const WORK_SECTION = /^(?:工作(?:与|及|和|\/|／)实习经历|工作经历|工作经验|职业经历|职业经验|任职经历|实习经历|实习经验|实习实践|实习|(?:research\s*(?:&|and)\s*)?(?:work(?:ing)?|professional|relevant|research|employment)\s+experiences?|(?:work|employment|career|professional)\s+history|(?:faculty\s+)?academic\s+appointments|postdoctoral\s+training|experiences?|employment|internship experiences?|internships?)(?=\s|[:：]|$|(?:19|20)\d{2})\s*[:：]?\s*(.*)$/iu;
export const EDUCATION_SECTION = /^(?:教育(?:及培训)?经历|教育(?:及培训)?背景|学习经历|学历|education(?:al)?(?:\s+(?:experiences?|background|history|qualifications|(?:and|&)\s*training))?|academic\s+(?:background|history|qualifications))(?=\s|[:：]|$|(?:19|20)\d{2})\s*[:：]?\s*(.*)$/iu;
export const MIXED_EXPERIENCE_SECTION = /^(?:教育(?:及|和|与|、)(?:工作|研究)经历|教育背景及(?:工作|研究)经历|(?:科研|研究)[&＆]教育经历|工作(?:与|及|和)(?:项目)?(?:科研|研究)(?:经历|经验)|(?:科研|研究)(?:与|及|和)工作经历|工作情况及科研成果|科研(?:经历)?(?:与|及)(?:研究)?成果|education\s*(?:and|&)\s*(?:work|research)\s*experiences?|(?:research\s*(?:and|&|\/)\s*(?:work(?:ing)?|professional)|(?:work(?:ing)?|professional)\s*(?:and|&|\/)\s*research)\s+(?:experiences?|history)|working\s+experience\s*(?:and|&)\s*research|research(?:\s+experiences?|\s+projects?)?\s*(?:and|&|\/)\s*(?:publications?|skills))\s*[:：]?$/iu;
export const RESEARCH_SECTION = /^(?:(?:(?:主要|学术|项目|博士|硕士|其他|其它)?(?:科研|研究)(?:项目|课题|工作|背景|经历|经验)(?:经历|经验)?|(?:博士|硕士|本科|研究生|参与|实验)课题(?:项目经历)?|博士论文课题|课题(?:与研究经历|研究|经历|经验|项目)|项目研究|(?:科研|研究)(?:与|及|\/)项目经历|项目(?:与|及|\/)(?:科研|研究)经历|科研相关工作)|(?:(?:selected|graduate|relevant|undergraduate|postdoctoral|clinical|key)\s+)?(?:(?:scientific|academic)\s+)?(?:research(?:\s*(?:&|and)\s*project)?\s+(?:experiences?|projects?(?:\s*(?:&|and)\s*experience)?|work|background|activities)|(?:scientific|academic|clinical|undergraduate|postdoctoral|key)\s+research|academic\s+r&d\s+experiences?|relevant\s+project\s+research\s+experience))\s*[:：]?$/iu;
export const OTHER_SECTION = /^(?:技能(?:及其他|、语言)?|专业技能(?:、任职及证书)?|个人技能|项目(?:经历|经验)(?:及成果)?|科研(?:项目|经历|成果|论文)|(?:主要)?(?:科研|研究|课题)成果|研究(?:方向|技能|兴趣|论文)|主要成果|学术成果|学工经历|发表文章|语言能力|附加信息|推荐理由|求职意向|个人简介|个人评价|自我评价|荣誉奖励|奖励荣誉|校园实践|获奖|证书|兴趣爱好|(?:technical\s+|professional\s+|core\s+|research\s+|r&d\s+)?skills|research\s*\/\s*laboratory\s+skills|research\s+(?:interests?|publications?)|(?:research\s+)?project\s+experiences?|(?:research\s+)?projects?|(?:professional\s+|research\s+)?summary(?:\s+of\s+qualifications)?|core\s+strengths?|profile|objective|certifications?|certificates?|(?:honors?[,\s]+)?awards?|grants\s+and\s+awards|(?:selected\s+)?publications?|research\s+articles?|research|bibliography|patents?(?:\s+of\s+invention)?(?:\s*\([^)]*\))?|professional\s+(?:organizations\s+and\s+society\s+memberships|affiliations\s*(?:&|and)\s*services)|leadership\s+experiences?|(?:practical\s*(?:&|and)\s*)?volunteer\s+experiences?|presentations?|personal\s+statement|languages?|interests?|references?)(?:\s*[:：].*|\s*)$/iu;
export const EXPERIENCE_DESCRIPTION = /^(?:research\s+projects?|research\s+(?:topics?|details?)|responsibilities|achievements|supervisors?|mentors?)\s*[:：]/iu;
export const FUNDING_SECTION = /^(?:grants?(?:\s*(?:and|&|\/)\s*awards?)?|research\s+funding)\s*[:：]?$/iu;
// Complete standalone headings only; a sentence such as "Honors: First Prize"
// can be an item inside a research project and is not itself a boundary.
export const ADDITIONAL_SECTION = /^(?:校园(?:经历|活动|实践经历)|荣誉奖项|荣誉|奖励|获奖经历|获奖情况|个人荣誉|专利|teaching(?:\s*(?:and|&)\s*mentoring)?(?:\s+(?:experiences?|history|activities))?|teaching\s*\/\s*conference\s+experiences?|teaching,\s*volunteering\s+and\s+outreach|leadership(?:\s+(?:experiences?|activities))?|leadership\s*(?:and|&)\s*(?:teaching\s+experiences?|honou?rs?|activities)|(?:practical|volunteer|volunteering|extracurricular|professional)\s+(?:experiences?|activities)|activities|honou?rs?(?:\s*(?:and|&)\s*(?:awards?|certificates?|distinctions?|scholarships?|rewards|funding|skills))*)\s*[:：]?$/iu;

export function isResumeSection(line: string): boolean {
  return MIXED_EXPERIENCE_SECTION.test(line) || RESEARCH_SECTION.test(line) || WORK_SECTION.test(line) || EDUCATION_SECTION.test(line) || OTHER_SECTION.test(line) || FUNDING_SECTION.test(line) || ADDITIONAL_SECTION.test(line) || EXPERIENCE_DESCRIPTION.test(line);
}

/** Only collapse typography when the result is a known section heading. */
export function cleanResumeLine(value: string): string {
  let line = value.trim().replace(/^[\s•●⚫▪◦·*\-➢➤▶►◼■◆◇<>《》\uE000-\uF8FF]+/u, "").trim();
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
  if (isResumeSection(compact) && /^(?:工作|教育|学习|职业|任职|实习|项目|科研|专业|个人|语言|研究|课题|博士|硕士|本科|其他|其它|主要|发表|荣誉|校园|附加|推荐|求职|自我|获奖|证书|兴趣)/u.test(compact)) return compact;
  return line;
}
