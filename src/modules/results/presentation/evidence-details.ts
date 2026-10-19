import type { EvidenceStrength, MatchEvidence } from "@/modules/matching/domain/models";

export const EVIDENCE_STRENGTH_LABELS: Record<EvidenceStrength, string> = {
  STRONG: "较强依据",
  MEDIUM: "一般依据",
  WEAK: "较弱依据",
};

const FACT_LABELS: Record<string, string> = {
  company: "共同公司",
  school: "共同学校",
  major: "共同专业",
  function: "相近的工作职能",
};

const SOURCE_FIELDS: Record<string, string> = {
  "company.raw": "公司名称", company: "公司名称",
  rawTitle: "职位", title: "职位",
  "school.raw": "学校名称", school: "学校名称",
  "major.raw": "专业", major: "专业",
  "dates.raw": "时间", start_date: "时间", end_date: "时间",
};

function sourceDescriptions(paths: string[]): string[] {
  const groups = new Map<string, Set<string>>();
  for (const path of paths) {
    const match = /^(workExperiences|work_experiences|educations|education_experiences)\[(\d+)\]\.(.+)$/u.exec(path);
    const field = match ? SOURCE_FIELDS[match[3]] : undefined;
    if (!match || !field) {
      groups.set("对应履历资料（具体位置暂不可用）", new Set());
      continue;
    }
    const isWork = match[1] === "workExperiences" || match[1] === "work_experiences";
    const heading = `第 ${Number(match[2]) + 1} 段${isWork ? "工作" : "教育"}经历`;
    const fields = groups.get(heading) ?? new Set<string>();
    fields.add(field === "时间" ? isWork ? "任职时间" : "就读时间" : field);
    groups.set(heading, fields);
  }
  return groups.size
    ? [...groups].map(([heading, fields]) => fields.size ? `${heading}：${[...fields].join("、")}` : heading)
    : ["资料出处暂不可用"];
}

function displayDate(value: string): string {
  const parts = value.split("-");
  return `${parts[0]} 年${parts[1] ? ` ${Number(parts[1])} 月` : ""}${parts[2] ? ` ${Number(parts[2])} 日` : ""}`;
}

export function describeEvidence(evidence: MatchEvidence) {
  const period = evidence.overlap;
  const precisionLabels = { YEAR: "现有资料只能确认到年份", MONTH: "现有资料可确认到月份", DAY: "现有资料可确认到日期" };
  return {
    facts: Object.entries(evidence.normalizedValues).map(([key, value]) => ({ label: FACT_LABELS[key] ?? "其他共同信息", value })),
    candidateSources: sourceDescriptions(evidence.candidateSourceFields),
    employeeSources: sourceDescriptions(evidence.employeeSourceFields),
    periodLabel: evidence.type.startsWith("WORK_") ? "共同任职时间" : "共同就读时间",
    period: period ? `${displayDate(period.start)} 至 ${displayDate(period.end)}` : "现有资料无法确认时间重叠",
    precision: period ? precisionLabels[period.precision] : null,
  };
}
