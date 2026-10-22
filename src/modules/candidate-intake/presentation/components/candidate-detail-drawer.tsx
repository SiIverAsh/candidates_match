import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { X, Network, FileText, ExternalLink, Building2, GraduationCap } from "lucide-react";
import { api, type CandidateDetail } from "@/client/api";
import { copyText } from "@/client/clipboard";
import { groupMatchResults } from "@/modules/results/domain/group-results";
import { ConfidenceGroup } from "@/modules/results/presentation/components/confidence-group";
import { CandidateProfilePreview } from "./candidate-profile-preview";
import { ResearchFunctionSummary } from "@/modules/research-functions/presentation/research-function-summary";

const TABS = ["matching", "functions", "profile"] as const;
type DrawerTab = (typeof TABS)[number];

export function CandidateDetailDrawer({ queryId, onClose, initialTab = "matching" }: { queryId: string; onClose: () => void; initialTab?: DrawerTab }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<DrawerTab>(initialTab);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = TABS[(TABS.indexOf(tab) + (event.key === "ArrowRight" ? 1 : -1) + TABS.length) % TABS.length];
    setTab(next);
    document.getElementById(`${next}-tab`)?.focus();
  }

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    let active = true;
    api.candidateDetail(queryId).then((value) => { if (active) setDetail(value); })
      .catch(() => { if (active) setError(true); });
    return () => {
      active = false;
      element?.close();
      document.body.style.overflow = overflow;
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, [queryId]);

  async function copyEmail(email: string) {
    setCopyError(false);
    setCopiedEmail(null);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    try {
      await copyText(email, dialog.current ?? undefined);
      setCopiedEmail(email);
      copyTimer.current = setTimeout(() => setCopiedEmail(null), 1800);
    } catch { setCopyError(true); }
  }

  const profile = detail?.profile;
  const name = profile?.candidateName ?? "候选人资料";
  const groups = detail?.run ? groupMatchResults(detail.run) : [];

  return <dialog ref={dialog} className="candidate-drawer" aria-labelledby="drawer-title"
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="drawer-panel">
      <header className="drawer-heading">
        <span className="candidate-avatar large" aria-hidden="true">{name.slice(0, 1)}</span>
        <div><h2 id="drawer-title">{name}</h2><p>候选人资料与内部人脉线索</p></div>
        <button className="icon-button" autoFocus type="button" aria-label="关闭候选人详情" onClick={onClose}><X size={20} /></button>
      </header>
      <div className="drawer-tabs" role="tablist" aria-label="候选人详情视图">
        <button id="matching-tab" type="button" role="tab" aria-selected={tab === "matching"} aria-controls="drawer-matching" tabIndex={tab === "matching" ? 0 : -1} onClick={() => setTab("matching")} onKeyDown={navigateTabs}><Network size={15} />内部人脉匹配<span>{detail?.run?.resultCount ?? "—"}</span></button>
        <button id="functions-tab" type="button" role="tab" aria-selected={tab === "functions"} aria-controls="drawer-functions" tabIndex={tab === "functions" ? 0 : -1} onClick={() => setTab("functions")} onKeyDown={navigateTabs}><Building2 size={15} />可能职能</button>
        <button id="profile-tab" type="button" role="tab" aria-selected={tab === "profile"} aria-controls="drawer-profile" tabIndex={tab === "profile" ? 0 : -1} onClick={() => setTab("profile")} onKeyDown={navigateTabs}><FileText size={15} />结构化简历</button>
      </div>
      <div className="drawer-body">
        {!detail ? <p className={error ? "form-error" : "empty-copy"} role={error ? "alert" : "status"}>{error ? "资料暂时无法加载，可能已过期或无权访问。请关闭后重试。" : "正在读取候选人资料…"}</p> : <>
          <section className="candidate-summary">
            <span><Building2 size={14} />{profile?.workExperiences[0]?.company.raw ?? "公司未识别"}</span>
            <span><GraduationCap size={14} />{profile?.educations[0]?.school.raw ?? "学校未识别"}</span>
          </section>
          {profile?.warnings.length ? <section className="parse-warning" role="status"><strong>解析提示 · 匹配结果可能不完整</strong><ul>{profile.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section> : null}
          <section id="drawer-matching" role="tabpanel" aria-labelledby="matching-tab" hidden={tab !== "matching"}>
            <div className="ats-info-banner"><Network size={17} /><div><strong>{detail.run ? `已找到 ${detail.run.resultCount} 位可能认识候选人的内部同事` : "尚未生成匹配结果"}</strong><p>推荐基于共同经历推断，不代表双方确定认识。优先查看高置信度结果的具体依据。</p></div></div>
            {detail.run ? <>
              <div className="drawer-counts">{groups.map((group) => <span key={group.confidence} className={group.confidence.toLowerCase()}>{group.label}<strong>{group.results.length}</strong></span>)}</div>
              {detail.run.resultCount ? <div className="confidence-groups">{groups.map((group) => <ConfidenceGroup key={group.confidence} group={group} copiedEmail={copiedEmail} onCopy={copyEmail} />)}</div> : <p className="empty-copy">未找到可用的共同经历匹配。可查看简历信息是否完整。</p>}
            </> : <p className="empty-copy">可在资料详情页重新解析并匹配。</p>}
            {copyError ? <p className="form-error" role="alert">邮箱复制失败，请手动复制卡片中的邮箱。</p> : null}
          </section>
          <section id="drawer-profile" role="tabpanel" aria-labelledby="profile-tab" hidden={tab !== "profile"}>{profile ? <CandidateProfilePreview profile={profile} /> : <p className="empty-copy">该简历尚未完成解析。</p>}</section>
          <section id="drawer-functions" role="tabpanel" aria-labelledby="functions-tab" hidden={tab !== "functions"}><ResearchFunctionSummary assessment={profile?.researchFunctions ?? detail.run?.candidateFunctions} queryId={queryId} /></section>
        </>}
      </div>
      <footer className="drawer-footer"><small>资料保留 7 天{detail ? ` · ${new Date(detail.query.expiresAt).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" })} 到期` : ""}</small><a className="secondary-link" href={`/candidates/${encodeURIComponent(queryId)}`}><ExternalLink size={14} />打开完整资料</a></footer>
    </div>
  </dialog>;
}
