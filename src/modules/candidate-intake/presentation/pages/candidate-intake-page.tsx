import { useState } from "react";
import { ArrowUpRight, Check, Download, FileSpreadsheet, History, Network, ShieldCheck } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace-header";
import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import { CandidateMatchPanel } from "../components/candidate-match-panel";

export function CandidateIntakePage({ user, onLogout }: {
  user: AuthenticatedUser;
  onLogout: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return <main className="app-shell matching-shell">
    <WorkspaceHeader user={user} onLogout={onLogout} />
    <section className="matching-workspace" aria-busy={busy}>
      <header className="matching-hero">
        <div><p className="matching-eyebrow"><Network size={15} />内部人脉匹配</p><h1>查找候选人的内部人脉</h1><p>单人直接查看推荐同事，多人下载完整匹配结果。</p></div>
        <a className="matching-history-link" href="/results"><History size={16} />查看匹配历史<ArrowUpRight size={15} /></a>
      </header>
      <div className="matching-layout">
        <div className="matching-main">
          <CandidateMatchPanel onBusyChange={setBusy} />
        </div>
        <aside className="matching-sidebar">
          <section className="matching-delivery-card">
            <span className="matching-delivery-icon"><FileSpreadsheet size={23} /></span>
            <p className="matching-eyebrow">自动识别文件</p>
            <h2>单人在线查看，多人下载 Excel</h2>
            <p>PDF、Word、TXT 按一位候选人匹配，直接展示推荐同事；Excel 按表格中的候选人逐人匹配，完成后自动下载结果。</p>
            <ul><li><Check size={15} />姓名、部门与联系邮箱</li><li><Check size={15} />高、中、低置信度与共同经历</li><li><Check size={15} />结果同步保存到匹配历史</li></ul>
            <a className="secondary-link" href="/api/candidate-batch/template" download><Download size={15} />下载候选人 Excel 示例</a>
          </section>
          <section className="matching-team-note"><ShieldCheck size={18} /><div><strong>团队共享，自动去重</strong><p>相同资料复用已有记录，候选人资料保留 7 天。</p></div></section>
          <p className="matching-inference-note">共同经历表示“可能认识”，请结合具体依据判断。</p>
          {user.role === "HR_ADMIN" ? <a className="matching-admin-link" href="/admin/employee-data">维护内部员工人才库<ArrowUpRight size={14} /></a> : null}
        </aside>
      </div>
    </section>
  </main>;
}
