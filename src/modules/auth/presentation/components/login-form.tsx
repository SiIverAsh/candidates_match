import { type FormEvent, useState } from "react";

import { api, ApiError } from "@/client/api";
import type { AuthenticatedUser } from "../../domain/user";

export function LoginForm({
  onAuthenticated,
}: {
  onAuthenticated: (user: AuthenticatedUser) => void;
}) {
  const [pending, setPending] = useState(false);
  const [invalidCredentials, setInvalidCredentials] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setInvalidCredentials(false);
    const form = new FormData(event.currentTarget);
    try {
      const user = await api.login(String(form.get("name") ?? ""), String(form.get("password") ?? ""));
      onAuthenticated(user);
    } catch (error) {
      setInvalidCredentials(error instanceof ApiError && error.status === 401);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit}>
      <div className="field-group">
        <label htmlFor="name">用户名</label>
        <input autoComplete="username" autoFocus id="name" name="name" placeholder="输入用户名" required type="text" />
      </div>
      <div className="field-group">
        <label htmlFor="password">密码</label>
        <input
          aria-describedby={invalidCredentials ? "login-error" : undefined}
          aria-invalid={invalidCredentials}
          autoComplete="current-password"
          id="password"
          name="password"
          placeholder="输入密码"
          required
          type="password"
        />
      </div>
      {invalidCredentials ? (
        <p className="form-error" id="login-error" role="alert">用户名或密码不正确，请重新输入。</p>
      ) : null}
      <button className="primary-button" disabled={pending} type="submit">
        {pending ? "正在登录…" : "登录"}
      </button>
      <p className="form-footnote">登录即表示你将按公司政策处理员工与候选人数据。</p>
    </form>
  );
}
