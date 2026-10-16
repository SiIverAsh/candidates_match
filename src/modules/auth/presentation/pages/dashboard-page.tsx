import { ArrowUpRight, FileText, Network, Users, History } from "lucide-react";
import { WorkspaceHeader } from "@/components/workspace-header";
import { hasPermission } from "../../domain/permissions";
import type { AuthenticatedUser } from "../../domain/user";

export function DashboardPage({ user, onLogout }: { user: AuthenticatedUser; onLogout: () => Promise<void> }) {
  const isAdmin = hasPermission(user, "employee-data:import");
  return (
    <main className="app-shell">
      <WorkspaceHeader user={user} onLogout={onLogout} />
      <section className="workspace">
        <div className="workspace-heading"><div><p className="eyebrow">CONNECTION FINDER</p><h1>欢迎回来，{user.displayName}</h1><p>从候选人的共同经历出发，找到可以帮助建立联系的内部同事。</p></div><a className="secondary-link" href="/candidates">进入候选人管理 <ArrowUpRight size={14} /></a></div>
        <div className="access-grid">
          <article className="access-card access-card-primary"><FileText className="dashboard-icon" size={24} /><h2>添加候选人简历</h2><p>上传简历或粘贴文本，解析工作、教育经历并查找内部人脉线索。</p><a className="button-link" href="/candidate/new">开始人脉匹配</a></article>
          <article className="access-card"><Users className="dashboard-icon" size={24} /><h2>候选人管理</h2><p>搜索已提交的候选人，在详情面板中查看结构化简历与共同经历。</p><a className="secondary-link" href="/candidates">打开候选人列表 <ArrowUpRight size={13} /></a></article>
          <article className="access-card"><History className="dashboard-icon" size={24} /><h2>匹配结果历史</h2><p>重新查看内部同事推荐、置信度和匹配证据，找到值得联系的人。</p><a className="secondary-link" href="/results">查看匹配结果 <ArrowUpRight size={13} /></a></article>
          <article className="access-card"><Network className="dashboard-icon" size={24} /><h2>内部员工人才库</h2><p>导入员工履历，管理员工资料、教育和工作经历，为关系匹配提供依据。</p>{isAdmin ? <a className="secondary-link" href="/admin/employee-data">管理员工数据 <ArrowUpRight size={13} /></a> : <span className="card-state card-state-muted">由 HR 数据管理员维护</span>}</article>
        </div>
        <section className="dashboard-guide"><div><Network size={20} /><h2>一次查询，发现可核验的人脉线索</h2><p>推荐代表“可能认识”，请结合共同经历判断，再自行联系内部同事。</p></div><ol><li><span>01</span><strong>提交简历</strong><p>文件上传或文本粘贴</p></li><li><span>02</span><strong>解析经历</strong><p>识别公司、学校和时间</p></li><li><span>03</span><strong>查看匹配</strong><p>优先检查高置信度依据</p></li></ol><small>候选人资料和匹配结果保留 7 天，到期自动删除。</small></section>
      </section>
    </main>
  );
}
