import type { CandidateProfile, ExperienceDateRange, NormalizedValue } from "@/modules/resume-parser/domain/models";

function normalizedLabel(value: NormalizedValue): string {
  if (!value.raw) return "未识别";
  if (!value.value || value.raw === value.value) return value.raw;
  return `${value.raw} → ${value.value}`;
}

function dateRangeLabel(value: ExperienceDateRange): string {
  if (!value.start) return "时间未识别";
  return `${value.start} — ${value.current ? "至今" : value.end ?? "结束时间未知"}`;
}

export function CandidateProfilePreview({ profile }: { profile: CandidateProfile }) {
  return (
              <section className="profile-preview" aria-labelledby="profile-title">
                <div className="section-heading">
                  <div><p className="eyebrow">标准候选人画像</p><h2 id="profile-title">{profile.candidateName ?? "姓名未提供"}</h2></div>
                  <small>{profile.parserVersion}</small>
                </div>
                <div className="profile-section">
                  <h3>工作经历 · {profile.workExperiences.length}</h3>
                  {profile.workExperiences.length ? profile.workExperiences.map((item) => (
                    <article className="experience-card" key={`work-${item.sequence}`}>
                      <strong>{normalizedLabel(item.company)}</strong>
                      <span>{item.rawTitle ?? "职位未识别"}{item.normalizedFunction.value ? ` · ${item.normalizedFunction.value}` : ""}</span>
                      <small>{dateRangeLabel(item.dates)} · 精度 {item.dates.startPrecision}</small>
                      {item.description ? <details><summary>工作职责与研究内容</summary><p style={{ whiteSpace: "pre-wrap" }}>{item.description}</p></details> : null}
                    </article>
                  )) : <p className="empty-copy">未识别到工作经历。</p>}
                </div>
                <div className="profile-section">
                  <h3>研究经历 · {profile.researchExperiences?.length ?? 0}</h3>
                  {profile.researchExperiences?.length ? profile.researchExperiences.map((item) => (
                    <article className="experience-card" key={`research-${item.sequence}`}>
                      <strong>{item.heading}</strong>
                      <p style={{ whiteSpace: "pre-wrap" }}>{item.description}</p>
                    </article>
                  )) : <p className="empty-copy">未识别到独立研究经历章节。</p>}
                </div>
                <div className="profile-section">
                  <h3>教育经历 · {profile.educations.length}</h3>
                  {profile.educations.length ? profile.educations.map((item) => (
                    <article className="experience-card" key={`education-${item.sequence}`}>
                      <strong>{normalizedLabel(item.school)}</strong>
                      <span>{normalizedLabel(item.major)}</span>
                      <small>{dateRangeLabel(item.dates)} · 精度 {item.dates.startPrecision}</small>
                    </article>
                  )) : <p className="empty-copy">未识别到教育经历。</p>}
                </div>
              </section>
  );
}
