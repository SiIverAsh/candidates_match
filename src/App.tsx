import { useEffect, useState } from "react";

import { api } from "@/client/api";
import { hasPermission } from "@/modules/auth/domain/permissions";
import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import { AdminAccessPage } from "@/modules/auth/presentation/pages/admin-access-page";
import { DashboardPage } from "@/modules/auth/presentation/pages/dashboard-page";
import { LoginPage } from "@/modules/auth/presentation/pages/login-page";
import { CandidateIntakePage } from "@/modules/candidate-intake/presentation/pages/candidate-intake-page";
import { CandidateLibraryPage } from "@/modules/candidate-intake/presentation/pages/candidate-library-page";
import { CandidateDetailPage } from "@/modules/candidate-intake/presentation/pages/candidate-detail-page";
import { EmployeeDataPage } from "@/modules/employee-data/presentation/pages/employee-data-page";
import { ResultsPage } from "@/modules/results/presentation/pages/results-page";
import { AiAssistant } from "@/modules/enterprise-ai/presentation/ai-assistant";
import { BatchImportPage } from "@/modules/candidate-batch/presentation/batch-import-page";

function navigate(path: string): void {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function ForbiddenPage() {
  return (
    <main className="centered-page">
      <section className="message-card" aria-labelledby="forbidden-title">
        <span className="eyebrow">权限受限</span>
        <h1 id="forbidden-title">你没有访问此页面的权限</h1>
        <p>如果你需要管理员能力，请联系系统管理员调整角色。</p>
        <a className="button-link" href="/">返回工作台</a>
      </section>
    </main>
  );
}

export default function App() {
  const [user, setUser] = useState<AuthenticatedUser | null | undefined>(undefined);
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    api.session().then(setUser).catch(() => setUser(null));
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  async function logout() {
    await api.logout();
    setUser(null);
    navigate("/login");
  }

  if (user === undefined) {
    return <main className="centered-page"><p>正在加载…</p></main>;
  }
  if (!user) {
    return (
      <LoginPage
        onAuthenticated={(authenticatedUser) => {
          setUser(authenticatedUser);
          navigate("/");
        }}
      />
    );
  }
  function renderAuthenticatedPage(user: AuthenticatedUser) {
    if (path === "/candidates/import") {
      return hasPermission(user, "candidate:query")
        ? <BatchImportPage user={user} onLogout={logout} />
        : <ForbiddenPage />;
    }
    if (path === "/admin/employee-data") {
      return hasPermission(user, "employee-data:import")
        ? <EmployeeDataPage user={user} onLogout={logout} />
        : <ForbiddenPage />;
    }
    if (path === "/candidate/new") {
      return hasPermission(user, "candidate:query")
        ? <CandidateIntakePage user={user} onLogout={logout} />
        : <ForbiddenPage />;
    }
    if (path === "/candidates" || path === "/results") {
      return hasPermission(user, "candidate:query")
        ? <CandidateLibraryPage key={path} user={user} onLogout={logout} resultsOnly={path === "/results"} />
        : <ForbiddenPage />;
    }
    const candidateRoute = path.match(/^\/candidates\/([^/]+)$/u);
    if (candidateRoute) {
      return hasPermission(user, "candidate:query")
        ? <CandidateDetailPage key={path} queryId={decodeURIComponent(candidateRoute[1])} user={user} onLogout={logout} />
        : <ForbiddenPage />;
    }
    const resultRoute = path.match(/^\/results\/([^/]+)$/u);
    if (resultRoute) {
      return hasPermission(user, "candidate:query")
        ? <ResultsPage queryId={decodeURIComponent(resultRoute[1])} user={user} onLogout={logout} />
        : <ForbiddenPage />;
    }
    if (path === "/admin") {
      return hasPermission(user, "employee-data:import")
        ? <AdminAccessPage user={user} />
        : <ForbiddenPage />;
    }
    return <DashboardPage user={user} onLogout={logout} />;
  }
  return <>{renderAuthenticatedPage(user)}<AiAssistant key={user.id} /></>;
}
