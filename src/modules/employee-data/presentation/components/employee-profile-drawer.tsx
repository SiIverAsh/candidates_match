import { useEffect, useId, useRef, useState } from "react";
import { Briefcase, GraduationCap, X } from "lucide-react";
import { api } from "@/client/api";
import type { EmployeeProfile, EmployeeRecord } from "../../domain/models";

export function EmployeeProfileDrawer({ employee, versionId, onClose }: {
  employee: EmployeeRecord;
  versionId: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [profile, setProfile] = useState<EmployeeProfile | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let active = true;
    api.employeeProfile(employee.employeeId, versionId)
      .then((value) => { if (active) setProfile(value); })
      .catch(() => { if (active) setError(true); });
    return () => {
      active = false;
      element?.close();
      document.body.style.overflow = overflow;
    };
  }, [employee.employeeId, versionId]);

  return (
    <dialog ref={dialog} className="employee-drawer" aria-labelledby={titleId}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="drawer-panel">
        <header className="drawer-heading">
          <span className="candidate-avatar large" aria-hidden="true">{employee.name.slice(0, 1)}</span>
          <div><h2 id={titleId}>{employee.name}</h2><p>{employee.currentDepartment} · {employee.currentTitle}</p></div>
          <button className="icon-button" autoFocus type="button" aria-label="关闭员工资料预览" onClick={onClose}><X size={20} /></button>
        </header>
        <div className="drawer-body">
          {error ? <p className="form-error" role="alert">员工资料读取失败，可能已无权访问或数据版本已更新。请关闭后重新选择。</p> : !profile ? <p className="empty-copy" role="status">正在读取员工履历…</p> : <>
            <section className="employee-basic-info" aria-label="员工基本信息">
              <h3>基本信息</h3>
              <dl>
                <div><dt>员工编号</dt><dd>{profile.employeeId}</dd></div>
                <div><dt>姓名</dt><dd>{profile.name}</dd></div>
                <div><dt>当前部门</dt><dd>{profile.currentDepartment || "未提供"}</dd></div>
                <div><dt>当前职位</dt><dd>{profile.currentTitle || "未提供"}</dd></div>
                <div className="employee-email"><dt>工作邮箱</dt><dd>{profile.email || "未提供"}</dd></div>
              </dl>
            </section>
            {profile.warnings?.length ? <section className="parse-warning"><strong>解析提示</strong><ul>{profile.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></section> : null}
            <section className="employee-history" aria-label="工作经历">
              <h3><Briefcase size={16} />工作经历 <span>{profile.workExperiences.length}</span></h3>
              {profile.workExperiences.length ? profile.workExperiences.map((work, index) => (
                <article className="experience-card" key={`work-${index}`}>
                  <strong>{work.company}</strong><span>{work.title || "职位未提供"}</span><small>{work.startDate || "开始时间未知"} — {work.current ? "至今" : work.endDate || "结束时间未知"}</small>
                  {work.description ? <details><summary>工作内容</summary><p style={{ whiteSpace: "pre-wrap" }}>{work.description}</p></details> : null}
                </article>
              )) : <p className="empty-copy">暂无工作经历。</p>}
            </section>
            <section className="employee-history" aria-label="教育经历">
              <h3><GraduationCap size={16} />教育经历 <span>{profile.educations.length}</span></h3>
              {profile.educations.length ? profile.educations.map((education, index) => (
                <article className="experience-card" key={`education-${index}`}>
                  <strong>{education.school}</strong><span>{education.major || "专业未提供"}{education.degree ? ` · ${education.degree}` : ""}</span><small>{education.startDate || "开始时间未知"} — {education.current ? "至今" : education.endDate || "结束时间未知"}</small>
                </article>
              )) : <p className="empty-copy">暂无教育经历。</p>}
            </section>
            {profile.sourceText ? <details><summary>查看导入原文</summary><pre className="resume-preview">{profile.sourceText}</pre></details> : null}
          </>}
        </div>
        <footer className="drawer-footer"><small>资料版本：{versionId}</small><button className="secondary-link" type="button" onClick={onClose}>关闭预览</button></footer>
      </div>
    </dialog>
  );
}
