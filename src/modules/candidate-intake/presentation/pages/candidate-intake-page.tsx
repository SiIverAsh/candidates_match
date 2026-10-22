import { useRef, useState } from "react";
import { ArrowUpRight, Check, Download, FileSpreadsheet, History, Network, ShieldCheck, UserRound, Users } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace-header";
import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import { BatchCandidateMatchPanel } from "@/modules/candidate-batch/presentation/batch-candidate-match-panel";
import { SingleCandidateMatchPanel } from "../components/single-candidate-match-panel";

type MatchingMode = "single" | "batch";

export function CandidateIntakePage({ user, onLogout, initialMode = "single" }: {
  user: AuthenticatedUser;
  onLogout: () => Promise<void>;
  initialMode?: MatchingMode;
}) {
  const [mode, setMode] = useState<MatchingMode>(initialMode);
  const [singleBusy, setSingleBusy] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const singleTab = useRef<HTMLButtonElement>(null);
  const batchTab = useRef<HTMLButtonElement>(null);
  const busy = singleBusy || batchBusy;
  const single = mode === "single";

  function focusMode(next: MatchingMode) {
    if (busy) return;
    setMode(next);
    (next === "single" ? singleTab : batchTab).current?.focus();
  }

  return <main className="app-shell matching-shell">
    <WorkspaceHeader user={user} onLogout={onLogout} />
    <section className="matching-workspace">
      <header className="matching-hero">
        <div><p className="matching-eyebrow"><Network size={15} />内部人脉匹配</p><h1>查找候选人的内部人脉</h1><p>单人直接查看推荐同事，多人下载完整匹配结果。</p></div>
        <a className="matching-history-link" href="/results"><History size={16} />查看匹配历史<ArrowUpRight size={15} /></a>
      </header>
      <div className="matching-mode-switch" role="tablist" aria-label="选择匹配人数" onKeyDown={(event) => {
        if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          focusMode(event.key === "Home" ? "single" : event.key === "End" ? "batch" : single ? "batch" : "single");
        }
      }}>
        <button ref={singleTab} id="single-match-tab" type="button" role="tab" aria-selected={single} aria-controls="single-match-panel" tabIndex={single ? 0 : -1} disabled={busy} onClick={() => setMode("single")}><span className="matching-mode-icon"><UserRound size={21} /></span><span><strong>单人匹配</strong><small>一份简历，直接查看推荐同事</small></span><span className="matching-mode-result">在线查看</span></button>
        <button ref={batchTab} id="batch-match-tab" type="button" role="tab" aria-selected={!single} aria-controls="batch-match-panel" tabIndex={!single ? 0 : -1} disabled={busy} onClick={() => setMode("batch")}><span className="matching-mode-icon"><Users size={21} /></span><span><strong>多人匹配</strong><small>Excel 或多份简历，批量完成匹配</small></span><span className="matching-mode-result">下载 Excel</span></button>
      </div>
      <div className="matching-layout">
        <div className="matching-main">
          <section id="single-match-panel" role="tabpanel" aria-labelledby="single-match-tab" hidden={!single}><SingleCandidateMatchPanel onBusyChange={setSingleBusy} /></section>
          <section id="batch-match-panel" role="tabpanel" aria-labelledby="batch-match-tab" hidden={single}><BatchCandidateMatchPanel onBusyChange={setBatchBusy} /></section>
        </div>
        <aside className="matching-sidebar">
          <section className="matching-delivery-card">
            <span className="matching-delivery-icon">{single ? <Network size={23} /> : <FileSpreadsheet size={23} />}</span>
            <p className="matching-eyebrow">{single ? "即刻查看" : "自动下载"}</p>
            <h2>{single ? "推荐同事与共同经历" : "匹配汇总与员工明细"}</h2>
            <p>{single ? "按高、中、低置信度展示内部同事，展开即可查看共同工作或教育经历。" : "处理完成后自动下载 Excel，汇总表查看各档推荐，明细表保留全部匹配同事。"}</p>
            <ul><li><Check size={15} />{single ? "姓名、部门与联系邮箱" : "候选人逐行匹配汇总"}</li><li><Check size={15} />{single ? "可核验的共同经历" : "高、中、低置信度员工与邮箱"}</li><li><Check size={15} />{single ? "结果同步保存到匹配历史" : "失败原因和来源记录一并保留"}</li></ul>
            {!single ? <a className="secondary-link" href="/api/candidate-batch/template" download><Download size={15} />下载候选人 Excel 示例</a> : null}
          </section>
          <section className="matching-team-note"><ShieldCheck size={18} /><div><strong>团队共享，自动去重</strong><p>相同资料复用已有记录，候选人资料保留 7 天。</p></div></section>
          <p className="matching-inference-note">共同经历表示“可能认识”，请结合具体依据判断。</p>
          {user.role === "HR_ADMIN" ? <a className="matching-admin-link" href="/admin/employee-data">维护内部员工人才库<ArrowUpRight size={14} /></a> : null}
        </aside>
      </div>
    </section>
  </main>;
}
