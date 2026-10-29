import assert from 'node:assert/strict';
import { parseResumeText } from '../src/modules/resume-parser/infrastructure/parsing/parse-resume-text';
import type { ResumeSource } from '../src/modules/resume-parser/domain/models';
import { educationDegree, hasEnglishDegree } from '../src/modules/resume-parser/domain/english-experiences';
const source: ResumeSource = { queryId: 'recheck', submittedBy: 'test', sourceType: 'TEXT', sourceFormat: 'plain-text', text: null, bytes: null, expiresAt: '2030-01-01' };
const parse = (text: string) => parseResumeText(source, text, '2026-10-29');
assert.equal(educationDegree('Be responsible for the research project'), null);
assert.equal(hasEnglishDegree('Be responsible for the research project'), false);
assert.equal(educationDegree('BE'), 'BE');
const degree = parse('Name: Jane Smith\nEducation:\n2006–2010 Example Institute of Technology, College of Science\nDegree Award: B. Sc. in Chemistry\n2014–2020 Example University, College of Science\nDegree Award: Ph. D. in Chemistry');
assert.deepEqual(degree.educations.map(x => [x.major.raw, x.degree]), [['Chemistry','B. Sc.'], ['Chemistry','Ph. D.']]);
const records = parse('Name: Jane Smith\nEducation & Credentials\nMD, Clinical Medicine (1988~1994)-Example University of Medical Sciences, China\nMS, Neurotology (1996~1999)- Example University of Medical Sciences, China\nPhD, Human Pathology (2000~2004)-Example Medical University, Japan\nECFMG Certified (2014); United States Medical License Examination');
assert.deepEqual(records.educations.map(x => [x.school.raw, x.major.raw, x.degree]), [['Example University of Medical Sciences, China','Clinical Medicine','MD'],['Example University of Medical Sciences, China','Neurotology','MS'],['Example Medical University, Japan','Human Pathology','PhD']]);
const work = parse('Name: Jane Smith\nWork Experience\nRegional Marketing Manager, APAC, Example Research Solutions, Life Science, Shanghai, China 01/2018-02/2019\nBusiness Development Manager, Life Science, Singapore. Example Healthcare, Singapore 11/2015-05/2016');
assert.deepEqual(work.workExperiences.map(x => [x.company.raw,x.rawTitle]), [['Example Research Solutions','Regional Marketing Manager'], ['Example Healthcare','Business Development Manager']]);
const duties = parse('Name: Jane Smith\nWork Experience\nLead internal and external collaborations with global cross-functional stakeholders.\nExample University, CA, USA — (2016–2018)\nSenior Research Scientist, School of Pharmacy');
assert.equal(duties.workExperiences[0].rawTitle, 'Senior Research Scientist');
const department = parse('Name: Jane Smith\nWork Experience\nExample Drug Development   Study Coordinator\nChemical Solutions   Nov 2021 – Oct 2024');
assert.equal(department.workExperiences[0].company.raw, 'Example Drug Development');
const table = parse('Name: Jane Smith\nWork Experience\nExample Pharmaceutical Co., Ltd.\t2018.10 - 2020.04\tGlobal PM&CRM\nExample Medical Research\t2013.09 - 2015.02\tCRA II\nExample Hospital\t2006.08 - 2008.10\tNurse');
assert.deepEqual(table.workExperiences.map(x => [x.company.raw, x.rawTitle, x.dates.start, x.dates.end]), [
  ['Example Pharmaceutical Co., Ltd.', 'Global PM&CRM', '2018-10', '2020-04'],
  ['Example Medical Research', 'CRA II', '2013-09', '2015-02'],
  ['Example Hospital', 'Nurse', '2006-08', '2008-10'],
]);
console.log('Recheck: degrees, credentials, organizations and responsibilities verified.');
