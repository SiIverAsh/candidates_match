import assert from "node:assert/strict";

import JSZip from "jszip";

import { parseDateRange } from "../src/modules/resume-parser/domain/dates";
import {
  normalizeCompany,
  normalizeFunction,
  normalizeSchool,
} from "../src/modules/resume-parser/domain/normalization";
import type { ResumeSource } from "../src/modules/resume-parser/domain/models";
import { extractResumeText } from "../src/modules/resume-parser/infrastructure/extraction/extract-resume-text";
import { parseResumeText } from "../src/modules/resume-parser/infrastructure/parsing/parse-resume-text";

const parsedAt = "2026-09-24T06:00:00.000Z";
const expiresAt = "2026-10-01T06:00:00.000Z";

function textSource(text: string, format: ResumeSource["sourceFormat"] = "plain-text"): ResumeSource {
  return {
    queryId: `query-${format}`,
    submittedBy: "test-user",
    sourceType: format === "plain-text" ? "TEXT" : "FILE",
    sourceFormat: format,
    text: format === "plain-text" ? text : null,
    bytes: format === "txt" ? new TextEncoder().encode(text) : null,
    expiresAt,
  };
}

assert.deepEqual(parseDateRange("2019-2021"), {
  raw: "2019-2021",
  start: "2019",
  end: "2021",
  startPrecision: "YEAR",
  endPrecision: "YEAR",
  current: false,
});
assert.deepEqual(parseDateRange("2021年3月 - 至今"), {
  raw: "2021年3月 - 至今",
  start: "2021-03",
  end: null,
  startPrecision: "MONTH",
  endPrecision: "UNKNOWN",
  current: true,
});
for (const raw of [
  "20 20 .09 — 20 2 4 .06",
  "2 0 2 0 . 0 9 — 2 0 2 4 . 0 6",
  "20\t20年 0 9 月 — 20 24 年 0 6 月",
]) {
  const dates = parseDateRange(raw);
  assert.equal(dates.raw, raw);
  assert.equal(dates.start, "2020-09", raw);
  assert.equal(dates.end, "2024-06", raw);
  assert.equal(dates.startPrecision, "MONTH", raw);
}
assert.equal(parseDateRange("20 25.9 — 至今").current, true);
assert.equal(parseDateRange("20 25.9 — 至今").start, "2025-09");
assert.equal(parseDateRange("20 20 . 0 9 . 0 1 — 20 24 . 0 6 . 3 0").end, "2024-06-30");
assert.equal(parseDateRange("20\n20 .09 — 20\n24 .06").start, null);
assert.equal(parseDateRange("12020 — 12024").start, null);
assert.equal(normalizeCompany("微软有限公司").value, "Microsoft");
assert.equal(normalizeCompany("示例科技有限公司").value, "示例科技");
assert.equal(normalizeCompany("AbbVie · 全职").value, "AbbVie");
assert.equal(normalizeCompany("AbbVie · Full-time").value, "AbbVie");
assert.equal(normalizeSchool("Peking University").value, "北京大学");
assert.deepEqual(normalizeFunction("产品数据经理").alternatives, ["产品", "工程与技术"]);
assert.equal(normalizeFunction("产品数据经理").confidence, "LOW");

const compatibilityResume = [
  "张⼩明", "⼯作经历",
  "2019.03 ⾄ 今   Example Institute / Researcher@Research Group",
  "Completed a research project.", "教育背景", "1", "",
  "2018.09 ⾄ 今   示例⼤学 / 硕⼠@⽣物化学",
  "2014.09 ⾄ 2018.06   另一⼤学 / 本科@⽣物⼯程",
].join("\n");
const compatibilityProfile = parseResumeText(textSource(compatibilityResume), compatibilityResume, parsedAt);
assert.equal(compatibilityProfile.candidateName, "张小明");
assert.equal(compatibilityProfile.workExperiences.length, 1);
assert.equal(compatibilityProfile.workExperiences[0].company.raw, "Example Institute");
assert.equal(compatibilityProfile.workExperiences[0].rawTitle, "Researcher@Research Group");
assert.equal(compatibilityProfile.workExperiences[0].dates.start, "2019-03");
assert.equal(compatibilityProfile.workExperiences[0].dates.current, true);
assert.equal(compatibilityProfile.educations.length, 2);
assert.equal(compatibilityProfile.educations[0].school.raw, "示例大学");
assert.equal(compatibilityProfile.educations[0].degree, "硕士");
assert.equal(compatibilityProfile.educations[0].major.raw, "生物化学");
assert.equal(compatibilityProfile.educations[0].dates.current, true);
assert.equal(compatibilityProfile.educations[1].dates.end, "2018-06");
assert.equal(parseDateRange("2019 - 今").current, true);

const completeResume = [
  "姓名：王小明",
  "工作经历",
  "公司：微软有限公司",
  "职位：高级产品经理",
  "任职时间：2021年3月 - 至今",
  "教育经历",
  "学校：Peking University",
  "专业：Computer Science",
  "就读时间：2017-2021",
].join("\n");

const complete = parseResumeText(textSource(completeResume), completeResume, parsedAt);
assert.equal(complete.parseStatus, "COMPLETE");
assert.equal(complete.candidateName, "王小明");
assert.equal(complete.workExperiences[0]?.company.value, "Microsoft");
assert.equal(complete.educations[0]?.school.value, "北京大学");
assert.equal(complete.educations[0]?.dates.startPrecision, "YEAR");
const identityText = `Name: Identity Person\nE-mail: PERSON@example.com\nLinkedIn: https://www.linkedin.com/in/Identity-Person/?trk=test\n员工编号：E-IDENTITY\n${completeResume}`;
const identified = parseResumeText(textSource(identityText), identityText, parsedAt);
assert.deepEqual({ ...identified.identity, resumeFingerprint: undefined }, { email: "person@example.com", profileUrl: "linkedin.com/in/identity-person", employeeId: "E-IDENTITY", resumeFingerprint: undefined });
assert.equal(identified.identity?.resumeFingerprint?.length, 20);

for (const [school, major] of [["Harvard University", "Cancer Biology"], ["Stanford University", "Immunology"], ["Tsinghua University", "Analytical Chemistry"], ["Nanyang Technological University", "Pharmacology"]]) {
  const text = `Education\n2019.09 - 2023.06, ${school}, ${major}`;
  const parsed = parseResumeText(textSource(text), text, parsedAt);
  assert.equal(parsed.educations[0].school.raw, school, "逗号后的生命科学专业不能并入学校名");
  assert.equal(parsed.educations[0].major.raw, major);
}

for (const name of ["丁鑫芳", "Jingyu Li (李靖宇)", "Jianxuan (Jax) Wu, Ph.D."]) {
  const text = `${name}\nname@example.com\n教育经历\n学校：示例大学\n学位：Doctor of Philosophy - PhD\n专业：Immunology\n时间：2017-2021`;
  const parsed = parseResumeText(textSource(text), text, parsedAt);
  assert.equal(parsed.candidateName, name.replace(/, Ph.D.$/u, ""));
  assert.equal(parsed.educations[0].degree, "Doctor of Philosophy - PhD");
  assert.equal(parsed.educations[0].major.raw, "Immunology");
  assert.equal(parsed.workExperiences.length, 0, "不能为只有教育经历的简历编造工作经历");
}

for (const numbers of [["1.", "2.", "3."], ["1、", "2、", "3、"], ["（1）", "（2）", "（3）"]]) {
  const numberedResume = [
    "姓名：编号经历测试", "工作经历",
    `${numbers[0]} Scientist I - Neuro Discovery; siRNA discovery`,
    "公司：示例药企 · 全职", "时间：2021年2月 - 2023年9月",
    "职责/成果：完成药理研究", "1. Design experiments", "2. Review results",
    `${numbers[1]} Associate Director; Co-Investigator`,
    "公司：Scholar Rock; Voyager Therapeutics · 全职", "时间：2023年9月 - 现在",
    `${numbers[2]} Research Intern`, "公司：Peking University", "时间：6 年 6 个月",
    "教育经历",
    `${numbers[0]} The Graduate Center, City University of New York`,
    "学位：Doctor of Philosophy - PhD", "专业：Molecular and Cellular Biology", "时间：2017年 - 2021年",
    `${numbers[1]} The Graduate Center, City University of New York`,
    "学位：Master of Philosophy - MPhil", "专业：Cell/Cellular and Molecular Biology", "时间：2015年 - 2017年",
    `${numbers[2]} 首都医科大学`, "学位：Doctor of Medicine - MD",
  ].join("\n");
  const profile = parseResumeText(textSource(numberedResume), numberedResume, parsedAt);
  assert.deepEqual(profile.workExperiences.map(item => item.rawTitle), [
    "Scientist I - Neuro Discovery; siRNA discovery", "Associate Director; Co-Investigator", "Research Intern",
  ]);
  assert.deepEqual(profile.workExperiences.map(item => item.company.raw), [
    "示例药企 · 全职", "Scholar Rock; Voyager Therapeutics · 全职", "Peking University",
  ]);
  assert.equal(profile.workExperiences[0].dates.start, "2021-02");
  assert.equal(profile.workExperiences[1].dates.current, true);
  assert.equal(profile.workExperiences[2].dates.start, null, "时长不能被当作起止年份");
  assert.deepEqual(profile.educations.map(item => item.school.raw), [
    "The Graduate Center, City University of New York", "The Graduate Center, City University of New York", "首都医科大学",
  ]);
  assert.deepEqual(profile.educations.map(item => item.major.raw), [
    "Molecular and Cellular Biology", "Cell/Cellular and Molecular Biology", null,
  ]);
  assert.deepEqual(profile.educations.map(item => item.dates.start), ["2017", "2015", null]);
  assert.deepEqual(profile.educations.map(item => item.dates.end), ["2021", "2017", null]);
  assert.equal(profile.parseStatus, "PARTIAL");
}

const inlineFields = "姓名：分号测试；工作经历\n公司：示例公司；职位：Scientist; siRNA discovery；任职时间：2020-2024\n教育经历\n学校：示例大学；专业：Chemistry; Biology；就读时间：2016-2020";
const inlineProfile = parseResumeText(textSource(inlineFields), inlineFields, parsedAt);
assert.equal(inlineProfile.candidateName, "分号测试");
assert.equal(inlineProfile.workExperiences[0].rawTitle, "Scientist; siRNA discovery");
assert.equal(inlineProfile.educations[0].major.raw, "Chemistry; Biology");
const titleBeforeCompany = "工作经历\n职位：研究员\n公司：示例药业\n任职时间：2020-2024";
const titleFirst = parseResumeText(textSource(titleBeforeCompany), titleBeforeCompany, parsedAt);
assert.equal(titleFirst.workExperiences.length, 1);
assert.equal(titleFirst.workExperiences[0].rawTitle, "研究员");
assert.equal(titleFirst.workExperiences[0].company.raw, "示例药业");
const numberedNarrative = "教育经历\n1. 示例大学\n专业：免疫学\n时间：2017-2021\n1. Published a paper with Example University\n2. Developed an assay with Example College";
assert.equal(parseResumeText(textSource(numberedNarrative), numberedNarrative, parsedAt).educations.length, 1);

for (const heading of ["实习经历", "实习经验", "实习", "工作与实习经历", "工作/实习经历", "Internship Experience", "Internships"]) {
  const resume = [
    "教育经历", "2019-2023 | 北京大学 | 计算机科学",
    heading, "2022-2023 | 腾讯 | 产品实习生",
  ].join("\n");
  const profile = parseResumeText(textSource(resume), resume, parsedAt);
  assert.equal(profile.educations.length, 1, heading);
  assert.equal(profile.educations[0]?.school.raw, "北京大学", heading);
  assert.equal(profile.workExperiences.length, 1, heading);
  assert.equal(profile.workExperiences[0]?.company.raw, "腾讯", heading);
  assert.equal(profile.workExperiences[0]?.rawTitle, "产品实习生", heading);
  assert.equal(profile.workExperiences[0]?.dates.start, "2022", heading);
}

const labelledInternship = [
  "教育经历", "学校：北京大学", "专业：计算机科学", "就读时间：2019-2023",
  "实习经历", "实习单位：腾讯", "实习岗位：产品实习生", "实习时间：2022-2023",
  "实习经历", "实习公司：阿里巴巴", "实习职位：研发实习生", "实习时间：2023-2024",
].join("\n");
const internships = parseResumeText(textSource(labelledInternship), labelledInternship, parsedAt);
assert.equal(internships.educations.length, 1);
assert.deepEqual(internships.workExperiences.map((item) => item.company.raw), ["腾讯", "阿里巴巴"]);
assert.deepEqual(internships.workExperiences.map((item) => item.rawTitle), ["产品实习生", "研发实习生"]);
assert.equal(internships.parseStatus, "PARTIAL", "缺少姓名时不能标记为完整简历");

const unheadedInternship = ["教育经历", "2019-2023 | 北京大学 | 计算机科学", "2022-2023 | 北京大学实验室 | Research Intern"].join("\n");
const unheaded = parseResumeText(textSource(unheadedInternship), unheadedInternship, parsedAt);
assert.equal(unheaded.educations.length, 1);
assert.equal(unheaded.workExperiences[0]?.company.raw, "北京大学实验室");
assert.equal(unheaded.workExperiences[0]?.rawTitle, "Research Intern");

const internshipCourse = ["教育经历", "2019-2023 | 示例大学 | 实习课程研究", "2023-2025 | 示例学院 | 计算机科学"].join("\n");
const educationOnly = parseResumeText(textSource(internshipCourse), internshipCourse, parsedAt);
assert.equal(educationOnly.workExperiences.length, 0);
assert.equal(educationOnly.educations.length, 2);

const reportedInternships = [
  "教育经历", "2019-2023 | 示例大学 | 计算机科学",
  "2025.01-2025.04 | 宝信软件 | 系统服务 部 实习生",
  "2026.09-至今 | 百济神州 | 数据分析实习生",
].join("\n");
const reported = parseResumeText(textSource(reportedInternships), reportedInternships, parsedAt);
assert.equal(reported.educations.length, 1);
assert.deepEqual(reported.workExperiences.map((item) => item.company.raw), ["宝信软件", "百济神州"]);
assert.deepEqual(reported.workExperiences.map((item) => item.rawTitle), ["系统服务 部 实习生", "数据分析实习生"]);
assert.equal(reported.workExperiences[0]?.dates.start, "2025-01");
assert.equal(reported.workExperiences[1]?.dates.current, true);

const unlabelledEducation = "2020.09—2024.06，上海电力大学，计算机科学与技术\n2025.9—至今，上海理工大学，软件工程";
const inferred = parseResumeText(textSource(unlabelledEducation), unlabelledEducation, parsedAt);
assert.equal(inferred.educations.length, 2);
assert.deepEqual(inferred.educations.map((item) => item.school.raw), ["上海电力大学", "上海理工大学"]);
assert.deepEqual(inferred.educations.map((item) => item.major.raw), ["计算机科学与技术", "软件工程"]);
assert.equal(inferred.educations[0]?.dates.start, "2020-09");
assert.equal(inferred.educations[0]?.dates.end, "2024-06");
assert.equal(inferred.educations[1]?.dates.current, true);
assert.equal(inferred.workExperiences.length, 0);

// Actual PDF extraction shape, including adjacent course prose.
const spacedEducation = [
  "教育背景",
  "20 20 .09 — 20 2 4 .06 ， 上海电力大学 ， 计算机科学与技术",
  "20 25.9 — 至今 ，   上海理工大学 ， 软件工程",
  "主修 课程 ： 深度学习、 软件测试、软件开发理论技术 、软件体系结构、 计算智能",
].join("\n");
const spaced = parseResumeText(textSource(spacedEducation), spacedEducation, parsedAt);
assert.deepEqual(spaced.educations.map((item) => item.school.raw), ["上海电力大学", "上海理工大学"]);
assert.deepEqual(spaced.educations.map((item) => item.major.raw), ["计算机科学与技术", "软件工程"]);
assert.equal(spaced.educations[0]?.dates.raw, "20 20 .09 — 20 2 4 .06");
assert.equal(spaced.educations[0]?.dates.start, "2020-09");
assert.equal(spaced.educations[0]?.dates.end, "2024-06");
assert.equal(spaced.educations[1]?.dates.start, "2025-09");
assert.equal(spaced.educations[1]?.dates.current, true);
assert.equal(spaced.warnings.includes("未识别到包含学校的教育经历。"), false);
assert.equal(spaced.workExperiences.length, 0);

const spacedInternship = "教育经历\n20 20 .09 — 20 24 .06 | 北京大学 | 软件工程师";
const spacedEmployment = parseResumeText(textSource(spacedInternship), spacedInternship, parsedAt);
assert.equal(spacedEmployment.educations.length, 0);
assert.equal(spacedEmployment.workExperiences[0]?.company.raw, "北京大学");
assert.equal(spacedEmployment.workExperiences[0]?.dates.start, "2020-09");

for (const education of [
  "上海电力大学，计算机科学与技术，2020.09—2024.06",
  "计算机科学与技术 | 2020.09—2024.06 | 上海电力大学",
  "上海电力大学 计算机科学与技术 本科 2020.09—2024.06",
  "上海电力大学\n2020.09—2024.06\n计算机科学与技术 本科",
  "2020.09—2024.06\n上海电力大学\n计算机科学与技术",
  "Peking University, Computer Science, 2020-2024",
]) {
  const profile = parseResumeText(textSource(education), education, parsedAt);
  assert.equal(profile.educations.length, 1, education);
  assert.equal(profile.educations[0]?.dates.startPrecision, education.includes("2020.09") ? "MONTH" : "YEAR", education);
  assert.ok(profile.educations[0]?.major.raw, education);
  assert.equal(profile.workExperiences.length, 0, education);
}

const schoolAndDates = "上海电力大学，2020.09—2024.06";
const incompleteEducation = parseResumeText(textSource(schoolAndDates), schoolAndDates, parsedAt);
assert.equal(incompleteEducation.educations[0]?.school.raw, "上海电力大学");
assert.equal(incompleteEducation.educations[0]?.major.raw, null);
assert.equal(incompleteEducation.parseStatus, "PARTIAL");

for (const nonEducation of [
  "2020-2024，负责北京大学客户项目，软件工程",
  "2020-2024 | 北京大学 | 软件工程师",
  "2020-2024 | 北京大学 | 讲师",
  "北京大学实验室\n研究实习生\n2022-2023",
  "北京大学\n2022-2023\n研究实习生",
  "北京大学，2022-2023\n讲师",
  "曾与上海理工大学合作开展软件工程项目，2020-2024",
]) {
  assert.equal(parseResumeText(textSource(nonEducation), nonEducation, parsedAt).educations.length, 0, nonEducation);
}

const mixedNoHeadings = [
  "2020.09—2024.06，上海电力大学，计算机科学与技术",
  "2025.01—2025.04 | 宝信软件 | 系统服务部实习生",
  "2025.9—至今，上海理工大学，软件工程",
  "2026.09—至今 | 百济神州 | 数据分析实习生",
].join("\n");
const mixed = parseResumeText(textSource(mixedNoHeadings), mixedNoHeadings, parsedAt);
assert.equal(mixed.educations.length, 2);
assert.equal(mixed.workExperiences.length, 2);
assert.equal(mixed.parseStatus, "PARTIAL", "缺少姓名时不能标记为完整简历");

const separateRecords = "上海电力大学，2020-2024\n上海理工大学，软件工程，2025-至今";
const separated = parseResumeText(textSource(separateRecords), separateRecords, parsedAt);
assert.equal(separated.educations.length, 2);
assert.equal(separated.educations[0]?.major.raw, null);
assert.equal(separated.educations[1]?.major.raw, "软件工程");

const degreeWithoutMajor = "上海电力大学，本科，2020-2024";
assert.equal(parseResumeText(textSource(degreeWithoutMajor), degreeWithoutMajor, parsedAt).educations[0]?.major.raw, null);

const partialResume = [
  "工作经历",
  "公司：示例科技有限公司",
  "职位：销售经理",
].join("\n");
const partial = parseResumeText(textSource(partialResume), partialResume, parsedAt);
assert.equal(partial.parseStatus, "PARTIAL");
assert.equal(partial.completeness.hasEducation, false);
assert.equal(partial.completeness.hasMissingDates, true);

const missingEndResume = [
  "工作经历",
  "公司：示例科技有限公司",
  "职位：销售经理",
  "任职时间：2021年",
  "教育经历",
  "学校：示例大学",
  "专业：市场营销",
  "就读时间：2017-2021",
].join("\n");
const missingEnd = parseResumeText(textSource(missingEndResume), missingEndResume, parsedAt);
assert.equal(missingEnd.parseStatus, "PARTIAL");
assert.equal(missingEnd.completeness.hasMissingDates, true);

const insufficient = parseResumeText(
  textSource("本人拥有丰富的团队合作经验，但没有提供公司、学校或任职时间。"),
  "本人拥有丰富的团队合作经验，但没有提供公司、学校或任职时间。",
  parsedAt,
);
assert.equal(insufficient.parseStatus, "INSUFFICIENT");

const textExtraction = await extractResumeText(textSource(completeResume, "txt"));
assert.equal(textExtraction.ok, true);
if (textExtraction.ok) assert.equal(textExtraction.text, completeResume);

const docx = new JSZip();
docx.file("word/document.xml", `
  <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body><w:p><w:r><w:t>Company: Microsoft</w:t></w:r></w:p>
    <w:p><w:r><w:t>Title: Product Manager</w:t></w:r></w:p></w:body>
  </w:document>
`);
const docxBytes = await docx.generateAsync({ type: "uint8array" });
const docxExtraction = await extractResumeText({
  ...textSource("", "docx"),
  bytes: docxBytes,
});
assert.equal(docxExtraction.ok, true);
if (docxExtraction.ok) assert.match(docxExtraction.text, /Company: Microsoft/u);

const educationDocx = new JSZip();
educationDocx.file("word/document.xml", `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${unlabelledEducation.split("\n").map((line) => `<w:p><w:r><w:t>${line}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`);
const educationDocxSource = { ...textSource("", "docx"), bytes: await educationDocx.generateAsync({ type: "uint8array" }) };
const extractedEducation = await extractResumeText(educationDocxSource);
assert.equal(extractedEducation.ok, true);
if (extractedEducation.ok) assert.equal(parseResumeText(educationDocxSource, extractedEducation.text, parsedAt).educations.length, 2);

function createSimplePdf(lines: string[]): Uint8Array {
  const escaped = lines.map((line) => line.replace(/[()\\]/g, "\\$&"));
  const commands = escaped.map((line, index) =>
    `${index === 0 ? "72 720 Td" : "0 -18 Td"} (${line}) Tj`).join("\n");
  const stream = `BT /F1 12 Tf\n${commands}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${new TextEncoder().encode(stream).byteLength} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(new TextEncoder().encode(pdf).byteLength);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = new TextEncoder().encode(pdf).byteLength;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

const pdfExtraction = await extractResumeText({
  ...textSource("", "pdf"),
  bytes: createSimplePdf(["Company: Microsoft", "Title: Product Manager", "Period: 2021 - present"]),
});
assert.equal(pdfExtraction.ok, true);
if (pdfExtraction.ok) assert.match(pdfExtraction.text, /Product Manager/u);

const educationPdfSource = { ...textSource("", "pdf"), bytes: createSimplePdf(["2020-2024, Peking University, Computer Science"]) };
const educationPdf = await extractResumeText(educationPdfSource);
assert.equal(educationPdf.ok, true);
if (educationPdf.ok) assert.equal(parseResumeText(educationPdfSource, educationPdf.text, parsedAt).educations[0]?.school.value, "北京大学");

const spacedPdfSource = { ...textSource("", "pdf"), bytes: createSimplePdf([
  "20 20 .09 - 20 2 4 .06, Peking University, Computer Science",
  "20 25.9 - present, Tsinghua University, Software Engineering",
]) };
const spacedPdf = await extractResumeText(spacedPdfSource);
assert.equal(spacedPdf.ok, true);
if (spacedPdf.ok) {
  const profile = parseResumeText(spacedPdfSource, spacedPdf.text, parsedAt);
  assert.deepEqual(profile.educations.map((item) => item.school.value), ["北京大学", "清华大学"]);
  assert.equal(profile.educations[0]?.dates.end, "2024-06");
  assert.equal(profile.educations[1]?.dates.current, true);
}

console.log("Resume parser verification passed");
