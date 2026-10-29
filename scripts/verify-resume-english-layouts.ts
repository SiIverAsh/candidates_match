import assert from "node:assert/strict";
import {
  inferEnglishWorkAt as work,
  inferEnglishEducationAt as education,
  englishSectionRole,
  englishEducationMajor,
} from "../src/modules/resume-parser/domain/english-experiences";
import { parseResumeText } from "../src/modules/resume-parser/infrastructure/parsing/parse-resume-text";

// Synthetic examples cover record boundaries and avoid retaining private corpus content.
assert.equal(work(["Senior Scientist, Cancer Biology Department, Example Therapeutics 2018-2022"], 0, true)?.company, "Example Therapeutics");
assert.equal(work(["Members of preclinical management team.", "Senior Scientist, Example Therapeutics 2018-2022"], 0, true), null);
assert.equal(work(["Projects", "Senior Scientist, Example Therapeutics 2018-2022"], 0, true), null);
assert.equal(work([
  "2018-2022 Research Associate, Discovery Technology Center, Example Research",
  "Centre China (ERC), Shanghai, China",
], 0, true)?.company, "Example Research Centre China (ERC)");
assert.equal(work(["2018-2022 Example PharmaTech, City, China", "Project details without a role"], 0, true)?.title, "");
assert.equal(work(["2018-2022 Postdoc; University of California, San Diego, CA"], 0, true)?.company, "University of California, San Diego, CA");
assert.equal(work(["2013.06-2017.04\tExample Institute, U.S.A.\tPostdoc; Cancer Biology; Immuno-oncology"], 0, true)?.company, "Example Institute, U.S.A.");
assert.equal(work(["2018-2022", "Example University"], 0, true, englishSectionRole("POSTDOCTORAL TRAINING") ?? undefined)?.title, "POSTDOCTORAL TRAINING");
assert.equal(work(["2018-2022 Example Therapeutics", "Director: 1) manage research; 2) develop models"], 0, true)?.title, "Director");
assert.equal(education([
  "Master of Science in Biopharmacy 2010-2012", "Example University",
  "Bachelor of Science in Pharmacy 2006-2010", "Example University",
], 0)?.lineCount, 2);
assert.equal(education([
  "2008-2011: Graduate Student, Example Medical", "University, City, China.",
], 0)?.school, "Example Medical University, City, China.");
assert.equal(education([
  "Center for Molecular Biology 2008-2011", "PhD, Biochemistry",
  "Other University 2004-2008", "Bachelor, Biotechnology",
], 0)?.dates, "2008-2011");
assert.equal(englishEducationMajor("Doctor of Philosophy in Clinical Sciences (Immunology & Inflammation)"), "Clinical Sciences (Immunology & Inflammation)");

function parse(text: string) {
  return parseResumeText({ queryId: "english-layout-check", submittedBy: "test", sourceType: "TEXT", sourceFormat: "plain-text", bytes: null, text, expiresAt: "2099-01-01" }, text, "2026-10-29");
}

const training = parse([
  "Name: Taylor Example",
  "EDUCATION",
  "2007-2012 Ph.D. in Neurobiology,",
  "Institute of Health Sciences, Example Institutes for Biological Sciences,",
  "Example Academy of Sciences, City, China.",
  "Mentor: Example Mentor",
  "2003-2007 Bachelor of Engineering in Biological Engineering",
  "School of Biological Sciences, Example University, City, China.",
  "POSTDOCTORAL TRAINING",
  "Dec 2016 - March 2020 Kidney Cancer Program, Comprehensive Cancer Center,",
  "Example Medical Center,",
  "Mentor: Example Mentor",
  "PUBLICATIONS",
].join("\n"));
assert.deepEqual(training.workExperiences.map(record => [record.company.raw, record.rawTitle, record.dates.start, record.dates.end]), [["Example Medical Center", "POSTDOCTORAL TRAINING", "2016-12", "2020-03"]]);
assert.equal(training.educations.length, 2);
assert.equal(training.educations[0].major.raw, "Neurobiology");
assert.ok(training.educations[0].school.raw?.startsWith("Institute of Health Sciences"));
assert.ok(!training.educations[0].school.raw?.startsWith("in Neurobiology"));

const associates = parse([
  "Name: Alex Example",
  "WORKING EXPERIENCE",
  "Postdoctoral Associate (PI: Dr. Example Mentor, M.D. & Ph.D.) 10/2021-present",
  "Example Medicine, City, State, United States.",
  "Postdoctoral Associate (PI: Dr. Other Mentor) 08/2020-10/2021",
  "Example College of Medicine, City, State, United States.",
  "EDUCATION EXPERIENCE",
  "Ph.D. Cell Biology (PI: Dr. Example Mentor) 09/2013-06/2020",
  "Example University School of Medicine / Example Institutes for Biological",
  "Sciences, Example Academy of Sciences.",
  "B.S. Biological Sciences (PI: Dr. Example Mentor) 09/2009-06/2013",
  "Oceanic University",
  "PUBLICATIONS",
].join("\n"));
assert.deepEqual(associates.workExperiences.map(record => [record.company.raw, record.rawTitle, record.dates.start, record.dates.end]), [
  ["Example Medicine, City, State, United States.", "Postdoctoral Associate", "2021-10", null],
  ["Example College of Medicine, City, State, United States.", "Postdoctoral Associate", "2020-08", "2021-10"],
]);
assert.deepEqual(associates.educations.map(record => [record.school.raw, record.major.raw, record.dates.start, record.dates.end]), [
  ["Example University School of Medicine / Example Institutes for Biological Sciences, Example Academy of Sciences.", "Cell Biology", "2013-09", "2020-06"],
  ["Oceanic University", "Biological Sciences", "2009-09", "2013-06"],
]);

const programPrefixes = parse([
  "Name: Casey Example",
  "Education Background",
  "2015-2020 Ph.D. in Biology (Advisor: Example Mentor).",
  "School of Basic Medical Sciences, Example University.",
  "2011-2015 Bachelor's Degree, Biological Sciences, Another University.",
  "2013.08-2013.12 Exchange Program, Global Learning Semester, Visiting University",
  "Academic Achievements",
  "Example Author, Other Author, Journal of Biological Sciences.",
].join("\n"));
assert.deepEqual(programPrefixes.educations.map(record => [record.school.raw, record.major.raw, record.degree, record.dates.start, record.dates.end]), [
  ["Example University.", "Biology", "Ph.D.", "2015", "2020"],
  ["Another University.", "Biological Sciences", "Bachelor's", "2011", "2015"],
  ["Visiting University", null, null, "2013-08", "2013-12"],
]);
assert.equal(education(["2011-2015 B.A. in History", "Example School of Oriental and African Studies"], 0)?.school, "Example School of Oriental and African Studies");

console.log("English layout boundaries, field attribution and academic resume checks passed.");
