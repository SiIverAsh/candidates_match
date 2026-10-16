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
                <div><dt>当前部门</dt><dd>{profile.currentDepartment}</dd></div>
                <div><dt>当前职位</dt><dd>{profile.currentTitle}</dd></div>
                <div className="employee-email"><dt>工作邮箱</dt><dd>{profile.email}</dd></div>
              </dl>
            </section>
            <section className="employee-history" aria-label="工作经历">
              <h3><Briefcase size={16} />工作经历 <span>{profile.workExperiences.length}</span></h3>
              {profile.workExperiences.length ? profile.workExperiences.map((work, index) => (
                <article className="experience-card" key={`work-${index}`}>
                  <strong>{work.company}</strong><span>{work.title}</span><small>{work.startDate} — {work.endDate ?? "至今"}</small>
                </article>
              )) : <p className="empty-copy">暂无工作经历。</p>}
            </section>
            <section className="employee-history" aria-label="教育经历">
              <h3><GraduationCap size={16} />教育经历 <span>{profile.educations.length}</span></h3>
              {profile.educations.length ? profile.educations.map((education, index) => (
                <article className="experience-card" key={`education-${index}`}>
                  <strong>{education.school}</strong><span>{education.major}</span><small>{education.startDate} — {education.endDate ?? "至今"}</small>
                </article>
              )) : <p className="empty-copy">暂无教育经历。</p>}
            </section>
          </>}
        </div>
        <footer className="drawer-footer"><small>资料版本：{versionId}</small><button className="secondary-link" type="button" onClick={onClose}>关闭预览</button></footer>
      </div>
    </dialog>
  );
}
