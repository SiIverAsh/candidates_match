import { WorkspaceHeader } from "@/components/workspace-header";
import { type FormEvent, useState } from "react";

import { api, type CandidateSubmissionResult } from "@/client/api";
import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import type { CandidateProfile } from "@/modules/resume-parser/domain/models";

import { CandidateProfilePreview } from "../components/candidate-profile-preview";

type InputMode = "file" | "text";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

function profileState(profile: CandidateProfile) {
  if (profile.parseStatus === "COMPLETE") return { label: "解析完整", className: "is-active" };
  if (profile.parseStatus === "PARTIAL") return { label: "部分解析", className: "is-partial" };
  if (profile.parseStatus === "INSUFFICIENT") return { label: "信息不足", className: "is-empty" };
  return { label: "解析失败", className: "is-empty" };
}

export function CandidateIntakePage({
  user,
  onLogout,
}: {
  user: AuthenticatedUser;
  onLogout: () => Promise<void>;
}) {
  const [mode, setMode] = useState<InputMode>("file");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CandidateSubmissionResult | null>(null);
  const [retryPending, setRetryPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fileValue = form.get("resumeFile");
    const textValue = form.get("resumeText");
    setPending(true);
    setResult(null);
    try {
      setResult(await api.submitCandidate({
        file: mode === "file" && fileValue instanceof File ? fileValue : null,
        text: mode === "text" && typeof textValue === "string" ? textValue : null,
      }));
    } catch {
      setResult({
        kind: "persistence_failed",
        message: "请求失败，请检查网络后重试。",
      });
    } finally {
      setPending(false);
    }
  }

  async function retryParsing(queryId: string) {
    setRetryPending(true);
    try {
      const parsing = await api.parseCandidate(queryId);
      const matching = parsing.kind === "profile" &&
        (parsing.profile.parseStatus === "COMPLETE" || parsing.profile.parseStatus === "PARTIAL")
        ? await api.runMatching(queryId)
        : null;
      setResult((current) => current?.kind === "accepted"
        ? { ...current, parsing, matching }
        : current);
    } finally {
      setRetryPending(false);
    }
  }

  if (result?.kind === "accepted") {
    const profile = result.parsing.kind === "profile" ? result.parsing.profile : null;
    const state = profile ? profileState(profile) : { label: "解析服务异常", className: "is-empty" };
    const canContinue = profile?.parseStatus === "COMPLETE" || profile?.parseStatus === "PARTIAL";
    const matchRun = result.matching?.kind === "matched" ? result.matching.run : null;
    return (
      <main className="app-shell">
        <WorkspaceHeader user={user} onLogout={onLogout} />
        <section className="candidate-workspace">
          <div className="query-success" aria-labelledby="query-success-title">
            <span className={`version-state ${state.className}`}>{state.label}</span>
            <p className="eyebrow">简历解析与实体标准化</p>
            <h1 id="query-success-title">
              {canContinue ? "候选人画像已生成" : "需要补充或重试候选人资料"}
            </h1>
            <p>原文、标准化值和日期精度均已保留；系统不会根据缺失字段虚构经历。</p>
            <dl className="query-receipt">
              <div><dt>查询编号</dt><dd><code>{result.query.id}</code></dd></div>
              <div><dt>输入方式</dt><dd>{result.query.sourceType === "FILE" ? "简历文件" : "简历文本"}</dd></div>
              <div><dt>员工数据版本</dt><dd><code>{result.query.employeeVersionId ?? "未绑定"}</code></dd></div>
              <div><dt>到期删除</dt><dd>{formatDate(result.query.expiresAt)}</dd></div>
            </dl>
            <ol className="query-progress" aria-label="处理进度">
              <li className="complete"><span>1</span><div><strong>资料接收</strong><small>已完成</small></div></li>
              <li className={profile && profile.parseStatus !== "FAILED" ? "complete" : "current"}><span>2</span><div><strong>简历解析</strong><small>{profile ? state.label : "服务暂时不可用"}</small></div></li>
              <li className={canContinue ? "complete" : ""}><span>3</span><div><strong>实体标准化</strong><small>{canContinue ? `规则 ${profile?.normalizerVersion}` : "未完成"}</small></div></li>
              <li className={matchRun ? "complete" : canContinue ? "current" : ""}><span>4</span><div><strong>关系匹配</strong><small>{matchRun ? `已完成 · ${matchRun.resultCount} 条结果` : canContinue ? "匹配暂未完成" : "未进入匹配"}</small></div></li>
            </ol>
            {profile?.warnings.length ? (
              <section className="parse-warning" role="status">
                <strong>{profile.parseStatus === "PARTIAL" ? "结果可能不完整" : "解析提示"}</strong>
                <ul>{profile.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>
              </section>
            ) : null}
            {profile && canContinue ? (
              <CandidateProfilePreview profile={profile} />
            ) : null}
            {matchRun ? (
              <section className="match-summary" aria-labelledby="match-summary-title">
                <div>
                  <p className="eyebrow">混合式关系匹配</p>
                  <h2 id="match-summary-title">
                    {matchRun.status === "COMPLETED"
                      ? `找到 ${matchRun.resultCount} 位有可核验证据的内部同事`
                      : "未找到具有可核验证据的内部同事"}
                  </h2>
                  <p>共同经历仅表示“可能认识”，不代表双方确定认识。可通过下方入口查看全部分组与证据。</p>
                </div>
                <dl className="match-metrics">
                  <div><dt>高置信度</dt><dd>{matchRun.results.filter((item) => item.confidence === "HIGH").length}</dd></div>
                  <div><dt>中置信度</dt><dd>{matchRun.results.filter((item) => item.confidence === "MEDIUM").length}</dd></div>
                  <div><dt>低置信度</dt><dd>{matchRun.results.filter((item) => item.confidence === "LOW").length}</dd></div>
                </dl>
                <small>规则 {matchRun.ruleVersion} · 阈值 {matchRun.thresholdVersion} · 员工版本 {matchRun.employeeVersionId}</small>
              </section>
            ) : canContinue && result.matching && result.matching.kind !== "matched" ? (
              <p className="form-error" role="alert">{result.matching.message}</p>
            ) : null}
            <div className="success-actions">
              <a className="secondary-link" href={`/candidates/${encodeURIComponent(result.query.id)}`}>资料预览</a>
              <a className="secondary-link" href="/candidates">候选人简历库</a>
              <a className="secondary-link" href="/results">结果历史</a>
              {matchRun ? (
                <a className="button-link" href={`/results/${encodeURIComponent(result.query.id)}`}>
                  查看全部可解释结果
                </a>
              ) : null}
              {!canContinue ? (
                <button className="primary-button" disabled={retryPending} onClick={() => void retryParsing(result.query.id)} type="button">
                  {retryPending ? "正在重试…" : "重试解析"}
                </button>
              ) : null}
              <button className="primary-button" onClick={() => setResult(null)} type="button">提交另一位候选人</button>
              <a className="secondary-link" href="/">返回工作台</a>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <WorkspaceHeader user={user} onLogout={onLogout} />
      <section className="candidate-workspace">
        <a className="back-link" href="/">← 返回工作台</a>
        <div className="candidate-heading">
          <div>
            <p className="eyebrow">候选人资料提交</p>
            <h1>查找可能认识该候选人的内部同事</h1>
            <p>上传单份简历或粘贴简历文本。至少需要工作经历或教育经历。</p>
          </div>
        </div>

        <div className="candidate-grid">
          <section className="query-card" aria-labelledby="candidate-form-title">
            <div className="section-heading">
              <div><p className="eyebrow">选择一种输入方式</p><h2 id="candidate-form-title">候选人简历</h2></div>
            </div>
            <div className="mode-tabs" role="tablist" aria-label="简历输入方式">
              <button
                className={`mode-tab ${mode === "file" ? "active" : ""}`}
                onClick={() => { setMode("file"); setResult(null); }}
                role="tab"
                aria-selected={mode === "file"}
                type="button"
              >上传文件</button>
              <button
                className={`mode-tab ${mode === "text" ? "active" : ""}`}
                onClick={() => { setMode("text"); setResult(null); }}
                role="tab"
                aria-selected={mode === "text"}
                type="button"
              >粘贴文本</button>
            </div>
            <form className="candidate-form" onSubmit={submit}>
              {mode === "file" ? (
                <label className="file-drop" htmlFor="resumeFile">
                  <strong>选择单份候选人简历</strong>
                  <span>支持 PDF、DOCX、UTF-8 TXT，最大 5 MB。</span>
                  <input id="resumeFile" name="resumeFile" type="file" accept=".pdf,.docx,.txt" required />
                </label>
              ) : (
                <label className="text-input-group" htmlFor="resumeText">
                  <strong>粘贴简历文本</strong>
                  <span>最多 100,000 字符；请包含公司、职位、学校或专业信息。</span>
                  <textarea
                    id="resumeText"
                    name="resumeText"
                    className="resume-textarea"
                    minLength={80}
                    maxLength={100000}
                    placeholder="示例：工作经历、公司、职位、任职时间；教育经历、学校、专业、就读时间…"
                    required
                  />
                </label>
              )}
              {result ? (
                <p className="form-error" role="alert">{result.message}</p>
              ) : null}
              <button className="primary-button" disabled={pending} type="submit">
                {pending ? "正在安全提交…" : "提交并开始解析"}
              </button>
            </form>
          </section>

          <aside className="privacy-panel" aria-labelledby="privacy-title">
            <p className="eyebrow">数据使用说明</p>
            <h2 id="privacy-title">仅用于本次关系匹配</h2>
            <ul>
              <li>一次只提交一位候选人</li>
              <li>输入内容保存 7 天后到期删除</li>
              <li>审计仅记录操作人、时间与查询编号</li>
              <li>不会记录联系结果或招聘反馈</li>
            </ul>
            <p>LinkedIn 链接、批量 Excel 和自动发送消息不属于当前范围。</p>
          </aside>
        </div>
      </section>
    </main>
  );
}
