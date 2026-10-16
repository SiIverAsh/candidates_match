import { useEffect, useState } from "react";
import { api, type CandidateDetail, type ResumePreview } from "@/client/api";
import { WorkspaceHeader } from "@/components/workspace-header";
import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import { CandidateProfilePreview } from "../components/candidate-profile-preview";

export function CandidateDetailPage({ queryId, user, onLogout }: { queryId: string; user: AuthenticatedUser; onLogout: () => Promise<void> }) {
  const [detail, setDetail] = useState<CandidateDetail | null>(null);
  const [error, setError] = useState(false);
  const [preview, setPreview] = useState<ResumePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [reparsing, setReparsing] = useState(false);
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
      const matched = await api.runMatching(queryId);
      if (matched.kind === "matched") {
        setDetail({ ...detail, profile: parsed.profile, run: matched.run });
        setReparseMessage("已重新解析并更新匹配结果。");
      } else { setReparseMessage(matched.message); }
    } catch { setReparseMessage("重新处理暂未完成，请重试。"); }
    finally { setReparsing(false); }
  }
  return (
    <main className="app-shell"><WorkspaceHeader user={user} onLogout={onLogout} />
      <section className="workspace library-workspace">
        <a className="back-link" href="/candidates">← 返回候选人简历库</a>
        {!detail ? <p role={error ? "alert" : "status"}>{error ? "资料不存在、已过期、无权访问或暂时无法加载。" : "正在加载候选人资料…"}</p> : <>
          <div className="workspace-heading"><div><h1>{detail.profile?.candidateName ?? "候选人资料"}</h1><p>查看已提交的简历信息和解析结果。</p></div>{detail.run ? <a className="button-link" href={`/results/${encodeURIComponent(queryId)}`}>查看匹配结果 · {detail.run.resultCount} 条</a> : <span className="status-chip">尚未生成匹配结果</span>}</div>
          <dl className="result-context"><div><dt>查询编号</dt><dd>{detail.query.id}</dd></div><div><dt>提交时间</dt><dd>{new Date(detail.query.submittedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</dd></div><div><dt>输入格式</dt><dd>{detail.query.sourceFormat.toUpperCase()}</dd></div><div><dt>到期删除</dt><dd>{new Date(detail.query.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</dd></div></dl>
          {detail.profile ? <><CandidateProfilePreview profile={detail.profile} />{detail.profile.warnings.length ? <section className="parse-warning"><strong>解析提示</strong><ul>{detail.profile.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></section> : null}</> : <p className="empty-copy">该资料尚未完成解析。</p>}
          <div className="success-actions"><button className="primary-button" type="button" disabled={reparsing} onClick={() => void reparse()}>{reparsing ? "正在重新处理…" : "重新解析并匹配"}</button></div>
          {reparseMessage ? <p role="status">{reparseMessage}</p> : null}
          <section className="history-panel"><div className="section-heading"><h2>简历原文</h2><button className="text-button" disabled={previewLoading} type="button" onClick={() => void loadPreview()}>{previewLoading ? "正在读取…" : preview ? "重新读取原文" : "查看原文"}</button></div>
            {previewError ? <p className="form-error" role="alert">原文读取失败，请重试。</p> : preview ? preview.text !== null ? <pre className="resume-preview">{preview.text}</pre> : <p className="empty-copy">{preview.message ?? "文件无法提取正文。"}</p> : <p className="empty-copy">点击“查看原文”预览简历中的文字内容。</p>}
          </section>
        </>}
      </section>
    </main>
  );
}
