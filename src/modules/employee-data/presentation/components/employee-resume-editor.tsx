import type { EmployeeResumeDraft } from "../../domain/resume-import";

export function EmployeeResumeEditor({ draft, onChange, disabled }: {
  draft: EmployeeResumeDraft;
  onChange: (draft: EmployeeResumeDraft) => void;
  disabled: boolean;
}) {
  return <fieldset className="employee-resume-editor" disabled={disabled}>
    <legend>单人员工资料 · 核对后加入员工库</legend>
    <p>请核对姓名和经历。系统已生成记录编号；邮箱、部门等未知信息可留空。日期保留 YYYY、YYYY-MM 或 YYYY-MM-DD；结束日期留空表示未知，只有勾选“当前经历”才表示至今。</p>
    {draft.warnings.length ? <div className="parse-warning"><ul>{draft.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div> : null}
    <div className="employee-import-fields">
      {([['employeeId', '员工编号'], ['name', '姓名'], ['email', '工作邮箱'], ['currentDepartment', '当前部门'], ['currentTitle', '当前职位']] as const).map(([key, label]) => <label key={key}>
        <span>{label}{key !== "name" ? "（可补充）" : ""}</span><input type={key === "email" ? "email" : "text"} value={draft.employee[key]} required={key === "name"} onChange={event => onChange({ ...draft, employee: { ...draft.employee, [key]: event.target.value } })} />
      </label>)}
    </div>
    <h3>工作经历</h3>
    {draft.workExperiences.map((work, index) => <fieldset className="employee-import-experience" key={index}>
      <legend>工作经历 {index + 1}</legend>
      <div className="employee-import-fields">{([['company', '公司'], ['title', '职位'], ['startDate', '开始日期'], ['endDate', '结束日期']] as const).map(([key, label]) => <label key={key}>
        <span>{label}</span><input type="text" placeholder={key.endsWith("Date") ? "YYYY / YYYY-MM / YYYY-MM-DD，未知留空" : undefined} disabled={key === "endDate" && work.current} value={work[key] ?? ""} required={key === "company"} onChange={event => onChange({ ...draft, workExperiences: draft.workExperiences.map((item, i) => i === index ? { ...item, [key]: event.target.value || (key === "endDate" ? null : "") } : item) })} />
      </label>)}</div>
      <label><input type="checkbox" checked={work.current ?? false} onChange={event => onChange({ ...draft, workExperiences: draft.workExperiences.map((item, i) => i === index ? { ...item, current: event.target.checked, endDate: event.target.checked ? null : item.endDate } : item) })} /> 当前经历（至今）</label>
      {work.description ? <details><summary>工作内容</summary><p style={{ whiteSpace: "pre-wrap" }}>{work.description}</p></details> : null}
      <button className="text-button" type="button" onClick={() => onChange({ ...draft, workExperiences: draft.workExperiences.filter((_, i) => i !== index) })}>移除此工作经历</button>
    </fieldset>)}
    <button className="text-button" type="button" onClick={() => onChange({ ...draft, workExperiences: [...draft.workExperiences, { company: "", title: "", startDate: "", endDate: null, current: false }] })}>添加工作经历</button>
    <h3>研究经历</h3>
    {(draft.researchExperiences ?? []).map((research, index) => <fieldset className="employee-import-experience" key={index}>
      <legend>研究经历 {index + 1}</legend>
      <div className="employee-import-fields">
        <label><span>原文标题</span><input type="text" value={research.heading} onChange={event => onChange({ ...draft, researchExperiences: (draft.researchExperiences ?? []).map((item, i) => i === index ? { ...item, heading: event.target.value } : item) })} /></label>
        <label><span>研究内容</span><textarea rows={8} value={research.description} onChange={event => onChange({ ...draft, researchExperiences: (draft.researchExperiences ?? []).map((item, i) => i === index ? { ...item, description: event.target.value } : item) })} /></label>
      </div>
      <button className="text-button" type="button" onClick={() => onChange({ ...draft, researchExperiences: (draft.researchExperiences ?? []).filter((_, i) => i !== index) })}>移除此研究经历</button>
    </fieldset>)}
    <button className="text-button" type="button" onClick={() => onChange({ ...draft, researchExperiences: [...(draft.researchExperiences ?? []), { heading: "研究经历", description: "" }] })}>添加研究经历</button>
    <h3>教育经历</h3>
    {draft.educations.map((education, index) => <fieldset className="employee-import-experience" key={index}>
      <legend>教育经历 {index + 1}</legend>
      <div className="employee-import-fields">{([['school', '学校'], ['major', '专业'], ['degree', '学位'], ['startDate', '开始日期'], ['endDate', '结束日期']] as const).map(([key, label]) => <label key={key}>
        <span>{label}</span><input type="text" placeholder={key.endsWith("Date") ? "YYYY / YYYY-MM / YYYY-MM-DD，未知留空" : undefined} disabled={key === "endDate" && education.current} value={education[key] ?? ""} required={key === "school"} onChange={event => onChange({ ...draft, educations: draft.educations.map((item, i) => i === index ? { ...item, [key]: event.target.value || (key === "endDate" ? null : "") } : item) })} />
      </label>)}</div>
      <label><input type="checkbox" checked={education.current ?? false} onChange={event => onChange({ ...draft, educations: draft.educations.map((item, i) => i === index ? { ...item, current: event.target.checked, endDate: event.target.checked ? null : item.endDate } : item) })} /> 当前经历（至今）</label>
      <button className="text-button" type="button" onClick={() => onChange({ ...draft, educations: draft.educations.filter((_, i) => i !== index) })}>移除此教育经历</button>
    </fieldset>)}
    <button className="text-button" type="button" onClick={() => onChange({ ...draft, educations: [...draft.educations, { school: "", major: "", degree: "", startDate: "", endDate: null, current: false }] })}>添加教育经历</button>
  </fieldset>;
}
