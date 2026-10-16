import { WorkspaceHeader } from "@/components/workspace-header";
import { useEffect, useState } from "react";

import { api } from "@/client/api";
import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import type { CandidateReadiness } from "@/modules/candidate-intake/domain/models";
import type {
  MatchRun,
} from "@/modules/matching/domain/models";
import type { CandidateProfile } from "@/modules/resume-parser/domain/models";
import {
  groupMatchResults,
} from "../../domain/group-results";

import { ConfidenceGroup } from "../components/confidence-group";

interface ResultsState {
  profile: CandidateProfile;
  run: MatchRun | null;
  readiness: CandidateReadiness;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

export function ResultsPage({
  user,
  queryId,
  onLogout,
}: {
  user: AuthenticatedUser;
  queryId: string;
  onLogout: () => Promise<void>;
}) {
  const [state, setState] = useState<ResultsState | null>(null);
  const [loadError, setLoadError] = useState<"unavailable" | "match_failed" | null>(null);
  const [retryPending, setRetryPending] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [profile, readiness] = await Promise.all([
          api.candidateProfile(queryId),
          api.candidateReadiness(),
        ]);
        try {
          const run = await api.matchRun(queryId);
          if (!cancelled) {
            setState({ profile, run, readiness });
            setLoadError(null);
          }
        } catch {
          if (!cancelled) {
            setState({ profile, run: null, readiness });
            setLoadError("match_failed");
          }
        }
      } catch {
        if (!cancelled) {
          setState(null);
          setLoadError("unavailable");
        }
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [queryId]);

  async function retryMatching() {
    setRetryPending(true);
    try {
      const result = await api.runMatching(queryId);
      if (result.kind === "matched" && state) {
        setState({ ...state, run: result.run });
        setLoadError(null);
      } else {
        setLoadError("match_failed");
      }
    } catch {
      setLoadError("match_failed");
    } finally {
      setRetryPending(false);
    }
  }

  async function copyEmail(email: string) {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(email);
      window.setTimeout(() => setCopiedEmail((current) => current === email ? null : current), 1800);
    } catch {
      setCopiedEmail(null);
    }
  }

  if (!state && !loadError) {
    return <main className="centered-page"><p>正在加载全部匹配结果…</p></main>;
  }

  if (!state) {
    return (
      <main className="centered-page">
        <section className="message-card">
          <p className="eyebrow">结果不可用</p>
          <h1>查询不存在、已过期或无权访问</h1>
          <p>安全查询引用：<code>{queryId}</code>。候选人数据到期后不可恢复，请重新提交资料。</p>
          <a className="button-link" href="/candidate/new">开始新查询</a>
        </section>
      </main>
    );
  }

  const { profile, run, readiness } = state;
  const groups = run ? groupMatchResults(run) : [];
  const activeVersionChanged = Boolean(
    run && readiness.activeVersion && readiness.activeVersion.id !== run.employeeVersionId,
  );
  const submittedAt = run?.submittedAt ?? run?.createdAt;

  return (
    <main className="app-shell">
      <WorkspaceHeader user={user} onLogout={onLogout} />

      <section className="results-workspace">
        <div className="table-actions"><a className="back-link" href="/results">← 返回结果历史</a><a href={`/candidates/${encodeURIComponent(queryId)}`}>候选人资料预览</a><a href="/candidate/new">新建查询</a></div>
        <header className="results-heading">
          <div>
            <p className="eyebrow">可解释结果</p>
            <h1>{profile.candidateName ? `${profile.candidateName} 的内部关系线索` : "候选人的内部关系线索"}</h1>
            <p>按共同经历证据强度、时间重叠和职能相似度综合排序。</p>
          </div>
          {run ? <span className="result-total">全部结果 · {run.resultCount}</span> : null}
        </header>

        <dl className="result-context">
          <div><dt>查询时间</dt><dd>{submittedAt ? formatDate(submittedAt) : "未知"}</dd></div>
          <div><dt>员工数据版本</dt><dd><code>{run?.employeeVersionId ?? "尚未生成"}</code></dd></div>
          <div><dt>查询编号</dt><dd><code>{queryId}</code></dd></div>
          <div><dt>到期删除</dt><dd>{formatDate(profile.expiresAt)}</dd></div>
        </dl>

        <section className="inference-notice" role="note">
          <strong>请审慎使用推荐</strong>
          <p>以下结果是基于共同经历的推断，表示员工可能认识候选人，不代表双方确定认识。</p>
        </section>

        {profile.parseStatus === "PARTIAL" ? (
          <section className="parse-warning" role="status">
            <strong>候选人资料仅完成部分解析，匹配结果可能不完整</strong>
            <ul>{profile.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
          </section>
        ) : null}

        {activeVersionChanged ? (
          <section className="version-update-note" role="status">
            当前员工数据已更新为 <code>{readiness.activeVersion?.id}</code>；本页仍使用查询时绑定的 <code>{run?.employeeVersionId}</code>，重新提交查询才会使用新版本。
          </section>
        ) : null}

        {!run ? (
          <section className="result-empty">
            <h2>匹配运行暂时不可用</h2>
            <p>查询引用已保留，可安全重试；页面不会展示技术堆栈或不完整员工数据。</p>
            <button className="primary-button" disabled={retryPending} onClick={() => void retryMatching()} type="button">
              {retryPending ? "正在重试…" : "重试匹配"}
            </button>
          </section>
        ) : run.status === "NO_RESULTS" || run.resultCount === 0 ? (
          <section className="result-empty">
            <h2>未找到具有可核验证据的内部同事</h2>
            <p>系统没有用无依据或仅语义相似的员工补齐结果。你可以补充候选人的公司、学校和时间信息后重新查询。</p>
            <a className="button-link" href="/candidate/new">补充并重新查询</a>
          </section>
        ) : (
          <div className="confidence-groups">
            {groups.map((group) => (
              <ConfidenceGroup copiedEmail={copiedEmail} group={group} key={group.confidence} onCopy={copyEmail} />
            ))}
          </div>
        )}

        {run ? (
          <footer className="result-version-footer">
            规则 {run.ruleVersion} · 阈值 {run.thresholdVersion} · 标准化 {run.normalizerVersion}
          </footer>
        ) : null}
      </section>
    </main>
  );
}
