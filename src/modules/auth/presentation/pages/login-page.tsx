import type { AuthenticatedUser } from "../../domain/user";
import { LoginForm } from "../components/login-form";

export function LoginPage({
  onAuthenticated,
}: {
  onAuthenticated: (user: AuthenticatedUser) => void;
}) {
  return (
    <main className="login-shell">
      <section className="login-context" aria-labelledby="product-title">
        <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
        <div>
          <p className="eyebrow">Internal recruiting tool</p>
          <h1 id="product-title">Connection Finder</h1>
          <p className="login-intro">从共同工作与教育经历中，找到最可能认识候选人的内部同事。</p>
        </div>
        <div className="privacy-note">
          <span aria-hidden="true">01</span>
          <p>仅限获授权的 HR 用户使用。系统会记录最小化安全审计信息。</p>
        </div>
      </section>
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-panel-inner">
          <p className="eyebrow">安全访问</p>
          <h2 id="login-title">登录工作台</h2>
          <p className="panel-description">请输入已配置的内部测试账号。</p>
          <LoginForm onAuthenticated={onAuthenticated} />
        </div>
      </section>
    </main>
  );
}
