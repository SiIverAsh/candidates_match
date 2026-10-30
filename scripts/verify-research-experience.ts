import assert from "node:assert/strict";
import { parseResumeText } from "../src/modules/resume-parser/infrastructure/parsing/parse-resume-text";
import type { ResumeSource } from "../src/modules/resume-parser/domain/models";

const source: ResumeSource = { queryId: "test", submittedBy: "test", sourceType: "TEXT", sourceFormat: "plain-text", text: null, bytes: null, expiresAt: "2030-01-01T00:00:00.000Z" };
const parse = (text: string) => parseResumeText(source, text, "2026-01-01T00:00:00.000Z");
const isolated = parse(`姓名：张三
工作经历
公司：示例公司
职位：工程师
科研经历
⚫ 项目甲
Research projects: A study of molecules
University of Example
2019 - 2021
教育经历
学校：示例大学
专业：生物学
学位：硕士`);
assert.equal(isolated.researchExperiences?.length, 1);
assert.match(isolated.researchExperiences![0].description, /⚫ 项目甲\nResearch projects: A study of molecules\nUniversity of Example\n2019 - 2021/u);
assert.equal(isolated.workExperiences.length, 1);
assert.equal(isolated.workExperiences[0].company.raw, "示例公司");
assert.ok(!isolated.workExperiences[0].description?.includes("University of Example"));
assert.equal(isolated.educations[0].school.raw, "示例大学");
const onlyResearch = parse("Research Experience\nWorked on a clinical study.\nMentor: A. Person");
assert.equal(onlyResearch.parseStatus, "PARTIAL");
assert.equal(onlyResearch.workExperiences.length, 0);
assert.equal(onlyResearch.educations.length, 0);
assert.equal(onlyResearch.researchExperiences?.[0].description, "Worked on a clinical study.\nMentor: A. Person");
const mixed = parse("工作与科研经历\n公司：示例公司\n职位：工程师\nResearch and Work Experience\nCompany: Another Company\nTitle: Engineer");
assert.equal(mixed.researchExperiences?.length, 0);
assert.equal(mixed.workExperiences.length, 2);
const multi = parse("1. 科研项目经历\n项目一\nSelected Research Projects\nProject two\nPublications\nPaper one");
assert.equal(multi.researchExperiences?.length, 2);
assert.equal(multi.researchExperiences?.[0].description, "项目一");
assert.equal(multi.researchExperiences?.[1].description, "Project two");
const columns = parse(`Education
⚫ Example University   Ph.D. student in Basic Medicine   Advisor: Prof. Smith   Sep 2020 – Present
⚫ Second University   Bachelor in Basic Medicine   Advisor: Prof. Lee | Ranking: 2/30   Sep 2015 – Jun 2020
Research Experience
Project alpha   Example University   Sep 2020 – Present
Project beta
Leadership Experience
Teaching Assistant   Example University   Aug 2023 – Present
Practical & Volunteer Experience
Volunteer at an institution`);
assert.equal(columns.educations.length, 2);
assert.equal(columns.educations[0].school.raw, "Example University");
assert.equal(columns.educations[0].major.raw, "Basic Medicine");
assert.equal(columns.educations[0].dates.start, "2020-09");
assert.equal(columns.educations[0].dates.current, true);
assert.equal(columns.educations[1].dates.end, "2020-06");
assert.equal(columns.researchExperiences?.length, 1);
assert.equal(columns.researchExperiences![0].description, "Project alpha   Example University   Sep 2020 – Present\nProject beta");
assert.equal(columns.workExperiences.length, 0);
const sectionBoundaries = parse(`工作经历
公司：示例公司
职位：工程师
研究课题
项目一
● Publication: A sample paper
项目二
Research Skills
Laboratory techniques
公司：不应识别为工作
职位：不应识别为职位`);
assert.equal(sectionBoundaries.researchExperiences?.[0].description, "项目一\n● Publication: A sample paper\n项目二");
assert.equal(sectionBoundaries.workExperiences.length, 1);
assert.equal(sectionBoundaries.workExperiences[0].company.raw, "示例公司");
const inlineBoundary = parse("研究经历\n项目一\nResearch Skills: PCR\nOther skill content");
assert.equal(inlineBoundary.researchExperiences?.[0].description, "项目一");
assert.equal(parse("其他研究经历\n项目一").researchExperiences?.[0].description, "项目一");
assert.equal(parse("其它研究经历\n项目一").researchExperiences?.[0].description, "项目一");
for (const boundary of ["TEACHING EXPERIENCE", "Teaching History", "TEACHING AND MENTORING EXPERIENCE", "HONORS:", "Honours", "Honors and Awards", "Leadership", "Leadership & Activities", "Extracurricular Activities", "Practical Experience", "校园经历", "荣誉奖项", "获奖情况", "个人荣誉", "专利", "个人评价", "荣誉", "奖励", "获奖经历"]) {
  const candidate = parse(`Research Experience\nStudy one\nPublication: Example paper\nHonors: First prize\n${boundary}\nOther section content`);
  assert.equal(candidate.researchExperiences?.[0].description, "Study one\nPublication: Example paper\nHonors: First prize", boundary);
  assert.equal(candidate.workExperiences.length, 0, boundary);
}
console.log("Research section separation, mixed headings, original text and research-only status verified.");
