import type { CandidateProfile } from "../../resume-parser/domain/models";
import type { EmployeeResumeDraft } from "./resume-import";
import type { EmployeeRecord } from "./models";

export function profileToEmployeeDraft(profile: CandidateProfile, metadata: Partial<EmployeeRecord> = {}): EmployeeResumeDraft {
  const latest = [...profile.workExperiences].sort((a, b) => Number(b.dates.current) - Number(a.dates.current) || (b.dates.end ?? b.dates.start ?? "").localeCompare(a.dates.end ?? a.dates.start ?? ""))[0];
  const warnings = [...profile.warnings];
  if (!metadata.email) warnings.push("未提供邮箱，联系方式留空。");
  if ([...profile.workExperiences, ...profile.educations].some(item => !item.dates.current && !item.dates.end)) warnings.push("部分经历结束时间未知，不视为当前经历。");
  if ([...profile.workExperiences, ...profile.educations].some(item => item.dates.end && item.dates.end.slice(0, 4) > profile.parsedAt.slice(0, 4))) warnings.push("来源包含未来结束日期，已按原文保留；关系匹配仅计算截至查询当天的重叠。");
  return {
    employee: { employeeId: "", name: profile.candidateName ?? "", email: "", currentDepartment: "", currentTitle: latest?.rawTitle ?? "", resumeFingerprint: profile.identity?.resumeFingerprint ?? null, ...metadata },
    workExperiences: profile.workExperiences.filter(work => work.company.raw).map(work => ({ company: work.company.raw!, title: work.rawTitle ?? "", startDate: work.dates.start ?? "", endDate: work.dates.end, current: work.dates.current, description: work.description ?? "" })),
    educations: profile.educations.filter(education => education.school.raw).map(education => ({ school: education.school.raw!, major: education.major.raw ?? "", degree: education.degree ?? "", startDate: education.dates.start ?? "", endDate: education.dates.end, current: education.dates.current })),
    researchExperiences: profile.researchExperiences?.map(({ heading, description }) => ({ heading, description })),
    warnings: [...new Set(warnings)],
  };
}
