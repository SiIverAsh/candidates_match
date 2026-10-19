import { type FormEvent, useEffect, useRef, useState } from "react";
import { WorkspaceHeader } from "@/components/workspace-header";
import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import { InlineMatchResults } from "@/modules/results/presentation/components/inline-match-results";
import { CANDIDATE_INTAKE_POLICY } from "../../domain/policies";
import { CandidateProfilePreview } from "../components/candidate-profile-preview";
import { useSingleResume } from "../use-single-resume";

export function CandidateIntakePage({ user, onLogout }: {
  user: AuthenticatedUser;
  onLogout: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"file" | "text">("file");
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const dragDepth = useRef(0);
  const { result, phase, error, submit, retryParsing, retryMatching } = useSingleResume();
  const pending = phase !== null;
  const accepted = result?.kind === "accepted" ? result : null;
  const profile = accepted?.parsing.kind === "profile" ? accepted.parsing.profile : null;
  const run = accepted?.matching?.kind === "matched" ? accepted.matching.run : null;
  const needsParsing = accepted && (!profile || profile.parseStatus === "FAILED" || profile.parseStatus === "INSUFFICIENT");

  useEffect(() => {
    function preventFileNavigation(event: globalThis.DragEvent) {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    }
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, []);

  function receiveFiles(files: File[]) {
    if (pending || !files.length) return;
    if (files.length !== 1) {
      setFileError("单份简历匹配一次只接收一个文件；多份简历请使用批量导入。");
      return;
    }
    const file = files[0];
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!CANDIDATE_INTAKE_POLICY.allowedExtensions.some((allowed) => allowed === extension)) {
      setFileError("请上传 PDF、DOCX 或 TXT 简历；Excel 请使用批量导入。");
      return;
    }
    if (!file.size || file.size > CANDIDATE_INTAKE_POLICY.maxFileBytes) {
      setFileError("简历不能为空，文件大小不能超过 5 MB。");
      return;
    }
    setFileError(null);
    setFileName(file.name);
    void submit({ file, text: null });
  }

  function submitText(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = new FormData(event.currentTarget).get("resumeText");
    if (typeof text !== "string") return;
    setFileError(null);
    setFileName(null);
    void submit({ file: null, text });
  }

  return (
    <main className="app-shell">
      <WorkspaceHeader user={user} onLogout={onLogout} />
      <section className="candidate-workspace">
        <a className="back-link" href="/">← 返回工作台</a>
        <div className="candidate-heading"><div>
          <p className="eyebrow">单份简历匹配</p>
          <h1>查找可能认识该候选人的内部同事</h1>
          <p>拖入或选择简历后自动解析、匹配，下方直接展示高、中、低置信度的员工资料。</p>
        </div></div>
        <div className="candidate-grid">
          <section className="query-card" aria-labelledby="candidate-form-title" aria-busy={pending}>
            <h2 id="candidate-form-title">候选人简历</h2>
            <div className="mode-tabs" role="tablist" aria-label="简历输入方式">
              <button className={`mode-tab ${mode === "file" ? "active" : ""}`} disabled={pending} onClick={() => { setMode("file"); setFileError(null); }} role="tab" aria-selected={mode === "file"} type="button">上传文件</button>
              <button className={`mode-tab ${mode === "text" ? "active" : ""}`} disabled={pending} onClick={() => { setMode("text"); setFileError(null); }} role="tab" aria-selected={mode === "text"} type="button">粘贴文本</button>
            </div>
            {mode === "file" ? (
              <label className={`file-drop single-resume-drop${dragging ? " is-dragging" : ""}`} htmlFor="resumeFile" aria-disabled={pending}
                onDragEnter={(event) => {
                  if (!event.dataTransfer.types.includes("Files")) return;
                  event.preventDefault();
                  dragDepth.current += 1;
                  if (!pending) setDragging(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = pending ? "none" : "copy";
                }}
                onDragLeave={() => {
                  dragDepth.current = Math.max(0, dragDepth.current - 1);
                  if (!dragDepth.current) setDragging(false);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  dragDepth.current = 0;
                  setDragging(false);
                  receiveFiles(Array.from(event.dataTransfer.files));
                }}>
                <strong>{pending ? "正在处理简历…" : dragging ? "松开文件，自动开始匹配" : "将单份简历拖到这里，或点击选择文件"}</strong>
                <span>支持 PDF、DOCX、UTF-8 TXT，最大 5 MB。选择后自动处理，无需提交。</span>
                <input id="resumeFile" type="file" accept=".pdf,.docx,.txt" disabled={pending} onChange={(event) => {
                  receiveFiles(Array.from(event.currentTarget.files ?? []));
                  event.currentTarget.value = "";
                }} />
              </label>
            ) : (
              <form className="candidate-form" onSubmit={submitText}>
                <label className="text-input-group" htmlFor="resumeText">
                  <strong>粘贴简历文本</strong><span>请包含工作经历或教育经历，80～100,000 字符。</span>
                  <textarea id="resumeText" name="resumeText" className="resume-textarea" minLength={CANDIDATE_INTAKE_POLICY.minTextCharacters} maxLength={CANDIDATE_INTAKE_POLICY.maxTextCharacters} disabled={pending} placeholder="工作经历：公司、职位、任职时间；教育经历：学校、专业、就读时间…" required />
                </label>
                <button className="primary-button" disabled={pending} type="submit">{pending ? "正在处理…" : "解析并匹配"}</button>
              </form>
            )}
            {fileName ? <p className="single-resume-filename">当前简历：{fileName}</p> : null}
            {fileError || error || (result && result.kind !== "accepted") ? <p className="form-error" role="alert">{fileError || error || (result && result.kind !== "accepted" ? result.message : null)}</p> : null}
          </section>
          <aside className="privacy-panel" aria-labelledby="privacy-title">
            <p className="eyebrow">数据使用说明</p><h2 id="privacy-title">仅用于关系匹配</h2>
            <ul><li>一次只提交一位候选人</li><li>输入内容保存 7 天后到期删除</li><li>不会记录联系结果或招聘反馈</li></ul>
            <p>多份简历或 Excel 数据，请前往<a href="/candidates/import">批量导入</a>。</p>
          </aside>
        </div>
        <div className="single-resume-status" role="status" aria-live="polite">
          {phase === "parsing" ? "正在上传并解析简历，请稍候…" : phase === "matching" ? "简历已解析，正在查找可能认识的员工…" : accepted ? "简历处理结束，请查看下方结果或提示。" : null}
        </div>
        {accepted && !pending ? (
          <section className="single-resume-results" aria-label="本次简历处理结果">
            <h2>{profile?.candidateName || fileName || "候选人"} · 匹配结果</h2>
            {run ? <InlineMatchResults key={run.id} run={run} /> : null}
            {accepted.matching && accepted.matching.kind !== "matched" ? <p className="form-error" role="alert">{accepted.matching.message}</p> : null}
            {accepted.parsing.kind !== "profile" ? <p className="form-error" role="alert">{accepted.parsing.message}</p> : null}
            {profile?.warnings.length ? <div className="parse-warning"><strong>解析提示</strong><ul>{profile.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}
            <div className="success-actions">
              {needsParsing ? <button className="primary-button" type="button" onClick={() => void retryParsing()}>重试解析并匹配</button> : !run ? <button className="primary-button" type="button" onClick={() => void retryMatching()}>重试匹配</button> : null}
              <a className="secondary-link" href={`/candidates/${encodeURIComponent(accepted.query.id)}`}>查看候选人资料</a>
              <a className="secondary-link" href="/candidates">候选人简历库</a>
            </div>
            {profile ? <details className="single-resume-profile"><summary>查看本次解析的工作与教育经历</summary><CandidateProfilePreview profile={profile} /></details> : null}
          </section>
        ) : null}
      </section>
    </main>
  );
}
