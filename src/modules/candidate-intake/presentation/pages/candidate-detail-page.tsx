import { useEffect, useState } from "react";
import { api, type CandidateDetail, type ResumePreview } from "@/client/api";
import { WorkspaceHeader } from "@/components/workspace-header";
import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import { CandidateProfilePreview } from "../components/candidate-profile-preview";
import { ResearchFunctionSummary } from "@/modules/research-functions/presentation/research-function-summary";

export function CandidateDetailPage({ queryId, user, onLogout }: { queryId: string; user: AuthenticatedUser; onLogout: () => Promise<void> }) {
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState<ResumePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [reparsing, setReparsing] = useState(false);
  const [matching, setMatching] = useState(false);
  const [reparseMessage, setReparseMessage] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    api.candidateDetail(queryId).then((value) => { if (active) setDetail(value); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [queryId]);
  async function loadPreview() {
    setPreviewLoading(true); setPreviewError(false);
    try { setPreview(await api.resumePreview(queryId)); } catch { setPreviewError(true); } finally { setPreviewLoading(false); }
  }
  async function reparse() {
    if (!detail) return;
    setReparsing(true); setReparseMessage(null);
    try {
      const parsed = await api.parseCandidate(queryId);
      if (parsed.kind !== "profile") { setReparseMessage(parsed.message); return; }
      setDetail({ ...detail, profile: parsed.profile, run: null });
      setReparseMessage("已重新解析，可点击开始匹配。");
    } catch { setReparseMessage("重新解析暂未完成，请重试。"); }
    finally { setReparsing(false); }
  }
  async function match() {
    if (!detail) return;
    setMatching(true); setReparseMessage(null);
    try {
      const matched = await api.runMatching(queryId);
      if (matched.kind === "matched") {
        setDetail({ ...detail, run: matched.run });
        setReparseMessage(matched.reused ? "已复用已有匹配结果，未重复写入。" : "匹配已完成。");
      } else { setReparseMessage(matched.message); }
    } catch { setReparseMessage("匹配暂未完成，请重试。"); }
    finally { setMatching(false); }
  }
  return (
    <main className="app-shell"><WorkspaceHeader user={user} onLogout={onLogout} />
      <section className="workspace library-workspace">
        <a className="back-link" href="/candidates">← 返回候选人简历库</a>
        {!detail ? <p role={error ? "alert" : "status"}>{error ? "资料不存在、已过期、无权访问或暂时无法加载。" : "正在加载候选人资料…"}</p> : <>
          <div className="workspace-heading"><div><h1>{detail.profile?.candidateName ?? "候选人资料"}</h1><p>查看已提交的简历信息和解析结果。</p></div>{detail.run ? <a className="button-link" href={`/results/${encodeURIComponent(queryId)}`}>查看匹配结果 · {detail.run.resultCount} 条</a> : <span className="status-chip">尚未生成匹配结果</span>}</div>
          <dl className="result-context"><div><dt>查询编号</dt><dd>{detail.query.id}</dd></div><div><dt>提交时间</dt><dd>{new Date(detail.query.submittedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</dd></div><div><dt>输入格式</dt><dd>{detail.query.sourceFormat.toUpperCase()}</dd></div><div><dt>到期删除</dt><dd>{new Date(detail.query.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</dd></div></dl>
          {detail.profile ? <><CandidateProfilePreview profile={detail.profile} />{detail.profile.warnings.length ? <section className="parse-warning"><strong>解析提示</strong><ul>{detail.profile.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section> : null}</> : <p className="empty-copy">该资料尚未完成解析。</p>}
          <div className="success-actions">
            {detail.run ? <a className="button-link" href={`/results/${encodeURIComponent(queryId)}`}>查看已有匹配</a> : <button className="primary-button" type="button" disabled={reparsing || matching || !detail.profile} onClick={() => void match()}>{matching ? "正在匹配…" : "开始匹配"}</button>}
            <button className="text-button" type="button" disabled={reparsing || matching} onClick={() => void reparse()}>{reparsing ? "正在重新解析…" : "重新解析"}</button>
          </div>
          <ResearchFunctionSummary assessment={detail.profile?.researchFunctions ?? detail.run?.candidateFunctions} queryId={queryId} />
          {reparseMessage ? <p role="status">{reparseMessage}</p> : null}
          <section className="history-panel"><div className="section-heading"><h2>简历原文</h2><button className="text-button" disabled={previewLoading} type="button" onClick={() => void loadPreview()}>{previewLoading ? "正在读取…" : preview ? "重新读取原文" : "查看原文"}</button></div>
            {previewError ? <p className="form-error" role="alert">原文读取失败，请重试。</p> : preview ? preview.text !== null ? <pre className="resume-preview">{preview.text}</pre> : <p className="empty-copy">{preview.message ?? "文件无法提取正文。"}</p> : <p className="empty-copy">点击“查看原文”预览简历中的文字内容。</p>}
          </section>
        </>}
      </section>
    </main>
  );
}
