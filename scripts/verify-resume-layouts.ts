import assert from "node:assert/strict";
import { parseDateRange } from "../src/modules/resume-parser/domain/dates";
import { parseResumeText } from "../src/modules/resume-parser/infrastructure/parsing/parse-resume-text";
import type { ResumeSource } from "../src/modules/resume-parser/domain/models";

// Synthetic layout regressions only; no candidate files or extracted personal data.
const source: ResumeSource = { queryId: "layout-regression", submittedBy: "test", sourceType: "TEXT", sourceFormat: "plain-text", text: null, bytes: null, expiresAt: "2026-12-01T00:00:00Z" };
const parse = (...lines: string[]) => parseResumeText(source, lines.join("\n"), "2026-10-29T00:00:00Z");

const multiline = parse("姓名：合成样例", "教 育 背 景", "示例大学   985   211   2015/09-2019/06", "生物技术", "本科", "工作经历工作经历", "示例药业有限公司   2020/01-至今", "细胞生物学研究员", "负责实验设计与结果分析。");
assert.equal(multiline.educations.length, 1);
assert.equal(multiline.educations[0].school.raw, "示例大学");
assert.equal(multiline.educations[0].major.raw, "生物技术");
assert.equal(multiline.educations[0].degree, "本科");
assert.equal(multiline.workExperiences.length, 1);
assert.equal(multiline.workExperiences[0].company.raw, "示例药业有限公司");
assert.equal(multiline.workExperiences[0].rawTitle, "细胞生物学研究员");
assert.equal(multiline.workExperiences[0].dates.current, true);

const faculty = parse("< < < 教育背景", "\uF09F 2018.09--2022.06   示例大学   药学院 药物化学 博士（导师：某某教授）", "\uF09F 2014.09--2018.06   示例工程学院   化学与化工学院   应用化学   本科（5%）", "研究方向", "2020-2021 示例公司 合作项目");
assert.equal(faculty.workExperiences.length, 0, "导师的职位和研究项目不能变成候选人工作");
assert.deepEqual(faculty.educations.map(entry => [entry.school.raw, entry.major.raw, entry.degree]), [["示例大学", "药物化学", "博士"], ["示例工程学院", "应用化学", "本科"]]);
const mentorWithoutBrackets = parse("教育背景", "2016-2020", "示例大学   药   学-导师示例教授/博士", "研究方向：实验室课题", "2020-2022   另一大学   生物化学   硕士");
assert.equal(mentorWithoutBrackets.workExperiences.length, 0);
assert.equal(mentorWithoutBrackets.educations.length, 2);
assert.equal(mentorWithoutBrackets.educations[0].major.raw, "药学");

const projectLead = parse("科研经历", "2018-2020   示例大学   项目负责人");
assert.equal(projectLead.workExperiences.length, 0, "科研项目角色不自动等同于任职");
assert.equal(projectLead.educations.length, 0);
const researchSection = parse("教育背景 Education Background", "2018-2022   示例大学   生物化学   本科", "科研经历", "2018-2022   示例大学", "课题题目：实验室研究", "项目经历 Project Experience", "2021-2022   另一大学   临床试验");
assert.equal(researchSection.educations.length, 1, "科研课题和双语项目标题不能制造重复教育记录");
assert.equal(researchSection.workExperiences.length, 0);

const tabular = parse("教育及培训背景", "学校名称：示例大学   所学专业：生物工程   就读时间：2014-2018   学历学位：本科", "工作经历", "公司名称：示例科技有限公司   职位名称：研发科学家   在职时间：2020-2024");
assert.equal(tabular.educations[0].school.raw, "示例大学");
assert.equal(tabular.educations[0].major.raw, "生物工程");
assert.equal(tabular.educations[0].degree, "本科");
assert.equal(tabular.workExperiences[0].rawTitle, "研发科学家");
assert.equal(tabular.workExperiences[0].dates.end, "2024");
const radicals = parse("教育经历", "2010-2014   示例⻩⼭学院   生物技术   本科", "工作经历", "2014-2020   ⻓⻰公司   研究员");
assert.equal(radicals.educations[0].school.raw, "示例黄山学院");
assert.equal(radicals.workExperiences[0].company.raw, "长龙公司");

const mixed = parse("教育及工作经历", "2014-2018   示例大学   药学院   本科", "2018-2022   示例大学   药学院   药物化学   博士（指导老师：示例教授）", "2022-至今   示例大学   药学院   博士后、助理研究员（合作导师：示例教授）", "学工经历", "2020-2021 学年 示例大学协会 副主席");
assert.equal(mixed.educations.length, 2);
assert.equal(mixed.educations[0].major.raw, null, "学院不是声明的专业");
assert.equal(mixed.workExperiences.length, 1);
assert.equal(mixed.workExperiences[0].company.raw, "示例大学");

const chineseAcademy = parse("教育和研究经历", "中国科学院大学，示例生物学研究所   2010.09-2016.09", "博士，生物化学与分子生物学", "另一农业大学，生命科学技术学院，生物技术   2006.09-2010.06", "学士，生物技术");
assert.deepEqual(chineseAcademy.educations.map(entry => [entry.school.raw, entry.major.raw, entry.degree, entry.dates.start]), [["中国科学院大学", "生物化学与分子生物学", "博士", "2010-09"], ["另一农业大学", "生物技术", "学士", "2006-09"]]);
const inlineRecords = parse("Education", "2014.06-2018.04\tExample Institute, U.S.A.\tPostdoc; Cancer Biology 2010.09-2013.12\tExample University, China.\tPh.D., Medical Genetics 2003.09-2010.07\tOther Medical University, China. M.S., Biochemistry and Molecular Biology");
assert.equal(inlineRecords.workExperiences.length, 1);
assert.equal(inlineRecords.workExperiences[0].company.raw, "Example Institute, U.S.A.", "博士后研究领域不能替代任职机构");
assert.equal(inlineRecords.educations.length, 2);
assert.equal(inlineRecords.educations[0].dates.start, "2010-09");
assert.equal(inlineRecords.educations[1].dates.start, "2003-09");
assert.ok(inlineRecords.educations.every(entry => !/University|Institute/u.test(entry.major.raw ?? "")), "同行多记录不能吞入另一所学校作为专业");
assert.equal(parse("Applied Position: Antibody Discovery Associate Director").workExperiences.length, 0);

const form = parse("3.自我评价", "具备工程经验。", "4.工作经历", "①公司名称：示例工程有限公司   起止时间：2019年4月至今", "所在部门/职位：工程部/项目经理   离职前薪资（税前）：10000 元/月", "5.如果您有项目经历，请填写近期项目", "职位：项目经理");
assert.equal(form.workExperiences.length, 1);
assert.equal(form.workExperiences[0].rawTitle, "工程部/项目经理");
assert.equal(form.workExperiences[0].dates.start, "2019-04");
const duration = parse("工作经验", "5、定时向总经理汇报物流相关工作事宜", "示例生物技术有限公司 （1年4个月）", "2024/5-至今", "仓库管理员");
assert.equal(duration.workExperiences[0].company.raw, "示例生物技术有限公司");
assert.equal(duration.workExperiences[0].rawTitle, "仓库管理员");
const partialDates = parse("教育经历与荣誉", "示例大学   生命科学研究院   生物化学   博士学位   2021.09 -", "另一大学   动物医学学院   动物医学   学士学位   2016.09-2021.06");
assert.equal(partialDates.educations.length, 2);
assert.equal(partialDates.educations[0].dates.start, "2021-09");
assert.equal(partialDates.educations[0].dates.end, null, "不能补造被截断的结束日期");
assert.equal(partialDates.educations[1].degree, "学士");
const degreeOnly = parse("教育背景", "学校：示例大学", "学历学位：理学博士学位", "就读时间：2018-2022");
assert.equal(degreeOnly.educations[0].major.raw, null, "学位标签不能变成专业");

const datesBefore = parse("工作经历", "2021/01-2022/10", "示例药业有限公司 | 分析部主管", "负责质量研究。", "2019/09-2020/07", "另一医疗用品有限公司研发分公司| 科学家", "主要支持药品开发。", "2019/03-2019/09", "国外示例工厂 | 实验室化学师");
assert.deepEqual(datesBefore.workExperiences.map(entry => [entry.company.raw, entry.dates.start]), [["示例药业有限公司", "2021-01"], ["另一医疗用品有限公司研发分公司", "2019-09"], ["国外示例工厂", "2019-03"]]);

const unknownNext = parse("工作经历", "公司：示例公司", "职位：研究员", "时间：2020-2022", "2015-2018", "无法确定此行的机构和角色");
assert.equal(unknownNext.workExperiences[0].dates.start, "2020", "未解析的新记录不能覆盖上一条的日期");
assert.ok(unknownNext.warnings.some(warning => warning.includes("未能可靠识别")));

const noDates = parse("教育经历", "毕业院校：示例工业学院   自动化 | 本科", "工作经历", "示例国家实验室 | 设备工程师   2024-01~至今");
assert.equal(noDates.educations[0].school.raw, "示例工业学院");
assert.equal(noDates.educations[0].major.raw, "自动化");
assert.equal(noDates.educations[0].dates.start, null);
assert.equal(noDates.workExperiences[0].dates.current, true);

const academicRole = parse("教育背景", "2010-2014 | 示例大学 | 生物技术 | 本科", "工作", "经历", "2024.10-至今   示例大学   博士后研究员");
assert.equal(academicRole.educations.length, 1);
assert.equal(academicRole.workExperiences[0].rawTitle, "博士后研究员");

const headerSchool = parse("毕业院校：示例大学", "教育背景", "2020-2024 | 示例大学 | 生物技术 | 本科");
assert.equal(headerSchool.educations.length, 1, "基本信息中的学校不能重复生成无日期教育记录");

for (const range of ["2019--2021", "2019‐2021", "2019−2021", "2019～2021"]) {
  assert.equal(parseDateRange(range).start, "2019");
  assert.equal(parseDateRange(range).end, "2021");
}
const tillNow = parse("Work Experience", "Principal Investigator, Example Institute   2021.01-till now");
assert.equal(tillNow.workExperiences[0].dates.current, true);

console.log("Synthetic resume layout verification passed");
