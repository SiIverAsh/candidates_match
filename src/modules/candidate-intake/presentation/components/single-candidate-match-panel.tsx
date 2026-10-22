import { type FormEvent, useEffect, useRef, useState } from "react";
import { FileText, Network, Upload } from "lucide-react";
import { InlineMatchResults } from "@/modules/results/presentation/components/inline-match-results";
import { CANDIDATE_INTAKE_POLICY } from "../../domain/policies";
import { CandidateProfilePreview } from "./candidate-profile-preview";
import { useSingleResume } from "../use-single-resume";
import { ResearchFunctionSummary } from "@/modules/research-functions/presentation/research-function-summary";

export function SingleCandidateMatchPanel({ onBusyChange }: {
  onBusyChange: (busy: boolean) => void;
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

  useEffect(() => { onBusyChange(pending); }, [onBusyChange, pending]);

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
      setFileError("单人匹配一次只接收一份简历；多份资料请切换上方的“多人匹配”。");
      return;
    }
    const file = files[0];
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!CANDIDATE_INTAKE_POLICY.allowedExtensions.some((allowed) => allowed === extension)) {
      setFileError("请上传 PDF、DOC、DOCX 或 TXT 简历；Excel 请切换上方的“多人匹配”。");
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
    <>
          <section className="matching-input-card" aria-labelledby="candidate-form-title" aria-busy={pending}>
            <div className="matching-card-heading">
              <div><h2 id="candidate-form-title">添加一位候选人</h2><p>上传简历后自动开始匹配，也可以粘贴简历文本。</p></div>
              <span className="matching-output-label"><Network size={14} />页面展示结果</span>
            </div>
            <div className="matching-input-switch" role="group" aria-label="单人简历输入方式">
              <button disabled={pending} onClick={() => { setMode("file"); setFileError(null); }} aria-pressed={mode === "file"} type="button"><Upload size={15} />上传简历</button>
              <button disabled={pending} onClick={() => { setMode("text"); setFileError(null); }} aria-pressed={mode === "text"} type="button"><FileText size={15} />粘贴文本</button>
            </div>
            {mode === "file" ? (
              <label className={`matching-drop${dragging ? " is-dragging" : ""}`} htmlFor="resumeFile" aria-disabled={pending}
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
                <span className="matching-upload-icon"><Upload size={27} /></span>
                <strong>{pending ? "正在解析并匹配…" : dragging ? "松开文件，自动开始匹配" : "拖入一份简历，查找可能认识候选人的同事"}</strong>
                <span>支持 PDF、DOC、DOCX、TXT · 每份最大 5 MB</span>
                <span className="matching-choose-file">选择简历文件</span>
                <small>选好即开始，匹配结果直接显示在下方</small>
                <input className="sr-only" id="resumeFile" type="file" accept=".pdf,.doc,.docx,.txt" disabled={pending} onChange={(event) => {
                  receiveFiles(Array.from(event.currentTarget.files ?? []));
                  event.currentTarget.value = "";
                }} />
              </label>
            ) : (
              <form className="candidate-form matching-text-form" onSubmit={submitText}>
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
        <div className="single-resume-status" role="status" aria-live="polite">
          {phase === "parsing" ? "正在上传并解析简历，请稍候…" : phase === "matching" ? "简历已解析，正在查找可能认识的员工…" : accepted ? "简历处理结束，请查看下方结果或提示。" : null}
        </div>
        {accepted && !pending ? (
          <section className="single-resume-results matching-results-card" aria-label="本次简历处理结果">
            <h2>{profile?.candidateName || fileName || "候选人"} · 匹配结果</h2>
            {accepted.reused ? <p role="status">团队中已存在相同简历，已复用共享候选人记录，保留原到期时间。</p> : null}
            {accepted.matching?.kind === "matched" && accepted.matching.reused ? <p role="status">已复用已有匹配结果，未重复写入匹配历史。</p> : null}
            {run ? <InlineMatchResults key={run.id} run={run} /> : null}
            {!run && profile ? <ResearchFunctionSummary assessment={profile.researchFunctions} queryId={profile.queryId} /> : null}
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
        ) : !pending && !result ? <section className="matching-result-placeholder"><Network size={25} /><h2>匹配到的同事会显示在这里</h2><p>包含姓名、部门、联系邮箱，以及双方的共同经历。</p></section> : null}
    </>
  );
}
