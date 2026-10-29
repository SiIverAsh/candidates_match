import { normalizePersonEmail, normalizePersonProfileUrl, type PersonIdentity } from "../../../shared/domain/person-identity";
import { EDUCATION_SECTION, WORK_SECTION } from "./resume-sections";
import { normalizeResumeText } from "./normalize-resume-text";

const NOT_NAME = /\b(?:curriculum|vitae|resume|profile|summary|experience|education|scientist|researcher|manager|director|university|college|institute|department|recruitment|international|building|consulting|confidential|candidate|report|interview|information|personal|professional|skills|contact|address|position|recommended|publications)\b|简历|个人信息|基本信息|个人优势|个人资料|自我评价|教育|工作|研究员|大学|学院|公司|联系方式|求职|技能|推荐|性别|出生|获奖|招聘|基本情况|科研|学术|成果|荣誉|项目|发表|论文|语言|证书|民族|籍贯|生日|住址|地址|电话|邮箱|学历|学位|主修|课程/iu;
const PERSONAL_FIELD = "性\\s*别|工作年限|出生(?:年月|日期)?|年\\s*龄|手\\s*机(?:号)?|电\\s*话|联系电话|邮\\s*箱|电子邮件|电子邮箱|学历|目前职位|民族|籍贯|政治面貌|现居(?:地)?|居住(?:地)?|求职意向|gender|age|phone|mobile|tel|e-?mail|birthplace|birthdate|address|residence";
const BIO_FIELD = `${PERSONAL_FIELD}|生\\s*日|期望城市|联系方式|电话/微信|最高学历|学位|户籍|戶籍|专业|研究方向|工作经验|医药研发从业经验|应聘岗位|应聘职位|cell|home|hometown|birth date|birth place|date of birth|birthday`.replace(/([\p{Script=Han}])(?=[\p{Script=Han}])/gu, "$1\\s*");
// Unlabelled short Chinese phrases need a surname signal; explicit name fields
// continue to accept names outside this list (including minority names).
const SURNAMES = new Set("赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉龚程嵇邢裴陆荣翁荀羊甄曲封芮储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘钭厉戎祖武符刘景詹束龙叶幸司韶黎乔苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍郤璩桑桂濮牛寿通边扈燕冀浦尚农温庄晏柴瞿阎充慕连茹习艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡文寇广禄阙东欧沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶曾沙养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公牟哈邝冼肖亓訚佘岳帅商佟闫拓朴逢旷亢占漆区覃滕粟鄢迟达鲜穆".split(""));
const NOT_HEADER_NAME = /\b(?:research|objectives|selected|investments|and|deals|methods|biochemical|major|chemistry|science|sciences|engineering|biology|medicine|china|shanghai|beijing|technical|training|assistant|postdoctoral|associate|panel|RNA)\b|内容|概述|^(?:本科|大专|博士后|硕士|博士|研发|制药|会计学|学习经历|户籍|浙江省|山东日照)$/iu;
for (const surname of "依蒲付赖白栗蒙来凡胥仝黄竹".split("")) SURNAMES.add(surname);

export function cleanResumeName(value: string): string {
  let name = normalizeResumeText(value).trim()
    .replace(/^(?:Dr|Mr|Mrs|Ms|Prof)\.\s*/iu, "")
    .split(new RegExp(`(?:\\s+|[|｜,，])(?=(?:${BIO_FIELD})(?:\\s*[:：]|\\s+))`, "iu"))[0]
    .split(/\s+(?=(?:\+?\d[\d ()-]{6,}|[\w.+-]+@[\w.-]+))/u)[0]
    .replace(/\s*(?:[,，]\s*|[（(]\s*)(?:Ph\.?\s?D\.?|M\.?D\.?|MSc|博士|硕士).*$/iu, "")
    .replace(/\s*[,，]\s*(?:理学|工学|医学|管理学)?(?:博士|硕士|学士).*$/u, "")
    .replace(/\s+(?:Ph\.?\s*D\.?|M\.?Sc\.?|M\.?D\.?)$/iu, "")
    .replace(/\s*[（(][\p{Script=Han}]{0,6}(?:博士|硕士|学士)[）)]$/u, "")
    .replace(/\s*[−–—-]\s*(?:curriculum vitae|resume)$/iu, "")
    .replace(/\s*[（(](?:male|female|求职意向[:：].*)[）)]$/iu, "")
    .replace(/\s*[（(](?:19|20)\d{2}[./-]\d{1,2}(?:[./-]\d{1,2})?[）)]$/u, "")
    .replace(/\s+[’‘']([A-Za-z]+)[’‘']\s+/u, " ($1) ")
    .replace(/[（(]([\p{Script=Han}\s]{2,10})[）)]/gu, (_, characters: string) => `(${characters.replace(/\s/gu, "")})`)
    .replace(/^([\p{Script=Han}]{2,4})\s*(?:博士|硕士|Ph\.?\s*D\.?)$/iu, "$1")
    .replace(/^([\p{Script=Han}](?:\s*[\p{Script=Han}]){1,3})\s+(?:博士|硕士|男|女)$/u, "$1")
    .replace(/\s*(?:[（(]\s*(?:个人简历|简历|男|女)\s*[）)]|个人简历|简历)\s*$/u, "")
    .replace(/\s+/gu, " ").trim();
  if (/^[\p{Script=Han}\s]{2,10}$/u.test(name) && name.replace(/\s/gu, "").length <= 4) name = name.replace(/\s/gu, "");
  return name;
}

function plausibleHeaderName(value: string): boolean {
  if (!value || value.length > 70 || NOT_NAME.test(value) || NOT_HEADER_NAME.test(value) || /[@\d/:：]/u.test(value) || /^(?:不详|未知|无|暂无|未提供|保密|匿名|N\/?A|unknown|-+)$/iu.test(value)) return false;
  const han = "[\\p{Script=Han}]{2,4}";
  const english = "[A-Za-z](?:[A-Za-z'-]*|\\.)(?:\\s+(?:\\([A-Za-z '-]+\\)\\s+)?[A-Za-z][A-Za-z'-]*){1,4}";
  if (/^[\p{Script=Han}]{2,8}(?:[·・][\p{Script=Han}]{2,8}){1,2}$/u.test(value)) return true;
  if (/^\p{Script=Han}/u.test(value) && !SURNAMES.has(value[0]) && !/^(?:欧阳|司马|上官|诸葛|东方|皇甫|尉迟|公孙|慕容|司徒|司空|夏侯|令狐)/u.test(value)) return false;
  return new RegExp(`^(?:${han}(?:\\s*(?:[（(]${english}[）)]|[|｜]\\s*${english}|[A-Za-z][A-Za-z '-]*))?|${english}(?:\\s*(?:[（(]${han}[）)]|${han}))?|[A-Za-z][A-Za-z'-]*,\\s+[A-Za-z][A-Za-z'-]*)$`, "u").test(value);
}

export function inferResumeName(text: string): string | null {
  const lines = normalizeResumeText(text).split(/\r?\n/u).map(line => line.replace(/^[\s\uE000-\uF8FF•●◆▪◦·>]+/u, "").trim()).filter(Boolean);
  for (let index = 0; index < Math.min(lines.length, 50); index++) {
    const labelled = lines[index].replace(/^\d{5,}(?=姓\s*名)/u, "").match(/(?:^|\s{2,}|\t)(?:(?:候选人姓\s*名|[姓性]\s*名|name|full name|candidate\s*name)(?:\s*[:：]\s*|\s+|$)|(?:候选人|candidate)\s*[:：]\s*|姓\s*名(?=[\p{Script=Han}]))(.*)$/iu);
    if (!labelled) continue;
    const raw = labelled[1].trim() || (lines[index + 1] ?? "").replace(/^[:：]\s*/u, "");
    const name = cleanResumeName(raw);
    if (name && !NOT_NAME.test(name) && !/[:：@]/u.test(name)) return name;
  }
  const bodyStart = lines.findIndex(line => EDUCATION_SECTION.test(line) || WORK_SECTION.test(line));
  for (const [index, line] of lines.slice(0, 16).entries()) {
    if (bodyStart >= 0 && index > bodyStart && !/[@]|(?:手机|电话|出生|性别|个人信息|个人资料|求职意向|(?:^|\n)[男女](?:\s|\n|$)|\b(?:phone|e-?mail)\b)/iu.test(lines.slice(Math.max(0, index - 1), index + 3).filter((_, offset) => offset + Math.max(0, index - 1) !== index).join("\n"))) continue;
    if (index >= 5 && /^[A-Za-z\s,.'-]+$/u.test(line) && !lines.slice(Math.max(0, index - 1), index + 2).some(text => /@|phone|e-?mail|电话|手机/iu.test(text))) continue;
    let header = line.replace(/^(?:个人简历|基本信息|简历|candidate report)\s*[:：–—-]?\s*/iu, "")
      .replace(/^.*招聘专用\s+(?=[\p{Script=Han}]{2,4}$)/u, "")
      .replace(/^[\d-]{6,}\s*(?=[\p{Script=Han}A-Za-z])/u, "")
      .replace(/^([\p{Script=Han}]{2,4})(?:\s*[|｜]\s*[男女]|\s+(?:在职|离职|中共党员|共青团员)|应聘岗位[:：]|流程状态[:：]).*$/u, "$1")
      .replace(/^([\p{Script=Han}]{2,4})\1\s*\/\s*.*$/u, "$1")
      .replace(/^([\p{Script=Han}]{2,4})(?:\s+|[,，])(?:(?:19|20)\d{2}(?:\s*届|[./-]\d)|[男女](?:\s|[·|｜,，])|(?:博士|硕士)(?:研究生|在读)|点击此处联系).*$/u, "$1");
    if (index < 3) header = header.replace(/^([\p{Script=Han}]{2,4})[.。]$/u, "$1");
    // A name beside a clearly labelled bio or university block is a separate header field.
    const column = header.split(/\t+| {2,}/u);
    if (column.length > 1 && plausibleHeaderName(cleanResumeName(column[0])) && (/大学|学院|university|college|(?:19|20)\d{2}|求职|性别|邮箱|@/iu.test(column.slice(1).join(" ")) || (/负责人|经理|研究员|科学家|工程师|专员/u.test(column.slice(1).join(" ")) && /^[男女]\s*[|/｜]/u.test(lines[index + 1] ?? "")))) header = column[0];
    header = header.replace(/^([\p{Script=Han}]{2,4})\s+(?=[^\s]*大学|[^\s]*学院).*$/u, "$1")
      .replace(/^([\p{Script=Han}]{2,4})\1$/u, "$1")
      .replace(/^([\p{Script=Han}]\s*[\p{Script=Han}](?:\s*[\p{Script=Han}]){0,2})\s*\/\s*(?=[A-Za-z])/u, "$1 | ");
    let name = cleanResumeName(header);
    name = name.replace(/^([\p{Script=Han}])\s+(?=[\p{Script=Han}](?:\s|[|｜(]))/u, "$1");
    if (plausibleHeaderName(name)) return name;
  }
  // In two-column documents the name can appear between body rows. Recover a
  // unique standalone name only when the header also contains contact evidence.
  if (/@|电话|手机|\b(?:phone|e-?mail)\b/iu.test(lines.slice(0, 35).join("\n"))) {
    const names = lines.slice(0, 30).map((line, index) => {
      if (/导师|推荐人|推荐顾问|supervisor|advisor|refere/iu.test(lines[index - 1] ?? "")) return null;
      const name = cleanResumeName(line);
      return /^[\p{Script=Han}]{2,3}$/u.test(name) && plausibleHeaderName(name) ? name : null;
    }).filter((name): name is string => Boolean(name));
    const unique = [...new Set(names)];
    if (unique.length === 1) return unique[0];
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
