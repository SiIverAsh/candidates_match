export const WORK_SECTION = /^(?:工作(?:与|及|和|\/|／)实习经历|工作经历|工作经验|职业经历|实习经历|实习经验|实习实践|实习|(?:work(?:ing)?|professional|relevant|research|employment)\s+experiences?|(?:work|employment|career|professional)\s+history|(?:faculty\s+)?academic\s+appointments|postdoctoral\s+training|experiences?|employment|internship experiences?|internships?)(?=\s|[:：]|$|(?:19|20)\d{2})\s*[:：]?\s*(.*)$/iu;
export const EDUCATION_SECTION = /^(?:教育经历|教育背景|学历|education(?:al)?(?:\s+(?:background|history|qualifications|(?:and|&)\s*training))?|academic\s+(?:background|history|qualifications))(?=\s|[:：]|$|(?:19|20)\d{2})\s*[:：]?\s*(.*)$/iu;
export const OTHER_SECTION = /^(?:技能(?:及其他)?|专业技能|项目经历|科研项目|个人简介|自我评价|获奖|证书|兴趣爱好|(?:technical\s+|professional\s+|core\s+)?skills|project\s+experiences?|projects?|(?:professional\s+)?summary(?:\s+of\s+qualifications)?|profile|objective|certifications?|certificates?|(?:honors?[,\s]+)?awards?|grants\s+and\s+awards|(?:selected\s+)?publications?|research\s+articles?|research|bibliography|professional\s+(?:organizations\s+and\s+society\s+memberships|affiliations\s*(?:&|and)\s*services)|presentations?|personal\s+statement|languages?|interests?|references?)(?:\s*[:：].*|\s*)$/iu;
export const EXPERIENCE_DESCRIPTION = /^(?:research\s+projects?|research\s+(?:topics?|details?)|responsibilities|achievements|supervisors?|mentors?)\s*[:：]/iu;

export function isResumeSection(line: string): boolean {
  return WORK_SECTION.test(line) || EDUCATION_SECTION.test(line) || OTHER_SECTION.test(line) || EXPERIENCE_DESCRIPTION.test(line);
}
