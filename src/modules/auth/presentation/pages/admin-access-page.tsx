import type { AuthenticatedUser } from "../../domain/user";

export function AdminAccessPage({ user }: { user: AuthenticatedUser }) {
  return (
    <main className="centered-page">
      <section className="message-card" aria-labelledby="admin-title">
        <span className="success-mark" aria-hidden="true">✓</span>
        <p className="eyebrow">管理员权限验证通过</p>
        <h1 id="admin-title">{user.displayName} 可以管理员工数据</h1>
        <p>角色鉴权已启用，可以导入员工履历并管理员工资料。</p>
        <a className="button-link" href="/">返回工作台</a>
      </section>
    </main>
  );
}
