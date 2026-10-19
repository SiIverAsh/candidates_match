import type { ReactNode } from "react";
import { Home, Users, Network, History, Plus, LogOut, Workflow } from "lucide-react";
import type { AuthenticatedUser } from "@/modules/auth/domain/user";

export function WorkspaceHeader({ user, onLogout, children }: {
  user: AuthenticatedUser;
  onLogout: () => Promise<void>;
  children?: ReactNode;
}) {
  const path = window.location.pathname;
  const candidatePage = path.startsWith("/candidate");
  const resultsPage = path.startsWith("/results");
  const employeePage = path.startsWith("/admin");
  const title = employeePage ? "内部员工人才库" : resultsPage ? "人脉匹配结果" : candidatePage ? "候选人管理" : "招聘工作台";
  const links = [
    { href: "/", label: "工作台", icon: Home, active: path === "/" },
    { href: "/candidates", label: "候选人管理", icon: Users, active: candidatePage },
    { href: "/results", label: "匹配结果历史", icon: History, active: resultsPage },
    ...(user.role === "HR_ADMIN" ? [{ href: "/admin/employee-data", label: "内部员工人才库", icon: Network, active: employeePage }] : []),
  ];
  return <>
    <aside className="ats-rail" aria-label="主导航">
      <a className="ats-logo" href="/" title="Connection Finder 工作台" aria-label="Connection Finder 工作台"><Workflow size={22} /></a>
      <nav>{links.map(({ href, label, icon: Icon, active }) => (
        <a key={href} href={href} title={label} aria-label={label} aria-current={active ? "page" : undefined} className={active ? "active" : ""}><Icon size={20} /></a>
      ))}</nav>
      <button className="rail-logout" type="button" title="退出登录" aria-label="退出登录" onClick={() => void onLogout()}><LogOut size={19} /></button>
    </aside>
    <header className="app-header">
      <div className="ats-header-title"><strong>{title}</strong><span className="ats-feature"><Network size={12} />内部人脉匹配</span></div>
      <div className="ats-header-actions">
        {children}
        <a className="secondary-link batch-header-link" href="/candidates/import">批量导入</a>
        <a className="button-link" href="/candidate/new"><Plus size={15} />添加简历</a>
        <div className="account-area"><span className="account-avatar" aria-hidden="true">{user.displayName.slice(0, 1)}</span><div className="account-copy"><strong>{user.displayName}</strong><span>{user.role === "HR_ADMIN" ? "管理员" : "招聘人员"}</span></div></div>
      </div>
    </header>
  </>;
}
