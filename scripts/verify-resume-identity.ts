import assert from "node:assert/strict";
import { cleanResumeName, inferResumeName } from "../src/modules/resume-parser/domain/identity";
import { normalizeResumeText } from "../src/modules/resume-parser/domain/normalize-resume-text";

const headers = [
  ["姓 名：王小明   出生年月：1994 年 10 月", "王小明"],
  ["姓 名\n：王小明 手机：13800000000", "王小明"],
  ["姓 名 王小明   出生年月 1994.09", "王小明"],
  ["姓名：李 明   学 历：硕 士", "李明"],
  ["电话：13800000000\t姓 名：李明", "李明"],
  ["个人简历 王小明", "王小明"],
  ["王小明 个人简历", "王小明"],
  ["王 小 明\n电话：13800000000", "王小明"],
  ["王小明 2026 届博士研究生", "王小明"],
  ["王小明   1994.07", "王小明"],
  ["王小明 求职意向：研究员", "王小明"],
  ["王小明，工学博士", "王小明"],
  ["王小明博士", "王小明"],
  ["王小明王小明\n男丨30岁", "王小明"],
  ["Dr. Robin Smith\nEDUCATION", "Robin Smith"],
  ["Candidate Name:\nMs. Jane Smith 李明", "Jane Smith 李明"],
  ["Candidate: Mr. Robin Smith", "Robin Smith"],
  ["Robin Smith   Birthplace: Example City", "Robin Smith"],
  ["Robin Smith   test@example.com", "Robin Smith"],
  ["Robin Smith (Ph.D.)", "Robin Smith"],
  ["李 明 | LI MING", "李明 | LI MING"],
  ["王小明（Xiaoming Wang）", "王小明(Xiaoming Wang)"],
  ["王小明 Robin", "王小明 Robin"],
  ["Smith, Robin", "Smith, Robin"],
  ["W. ROBIN SMITH", "W. ROBIN SMITH"],
  ["Robin Smith(male)", "Robin Smith"],
  ["Robin Smith (1986.02)", "Robin Smith"],
  ["Robin ’Tim’ Smith", "Robin (Tim) Smith"],
  ["李明李明 / 项目专员", "李明"],
  ["教育背景\n示例大学\n生物学\n工作经历\n李明\n示例公司\n工程师\n联系方式\n电话：13800000000", "李明"],
];
for (const [text, expected] of headers) assert.equal(inferResumeName(text), expected, text);
for (const text of [
  "个人优势\n自我评价\n教育经历\n示例大学\n生物技术",
  "EDUCATION\nBiological Sciences\nExample University\nRESEARCH EXPERIENCE",
  "科研经历\n博士后\n基础医学\n本科\n大专",
  "Shanghai, China\nSELECTED INVESTMENTS AND DEALS\nResearch Objectives",
  "教育背景\n示例大学\n经历概述\n后等内容\n电话：13800000000",
]) assert.equal(inferResumeName(text), null, "Cannot use a heading, major or location as a name");
assert.equal(cleanResumeName("张小明 民 族 汉 族"), "张小明");
assert.equal(normalizeResumeText("⻓⻰⻩⻘⺠⻔ ⼯作经历"), "长龙黄青民门 工作经历");
assert.equal(normalizeResumeText("⼯作经历"), "工作经历");
console.log("Resume name labels, split cells, header metadata and false-positive guards verified.");
