import { type FormEvent, useEffect, useRef, useState } from "react";

import { api, ApiError } from "@/client/api";
import { INITIAL_IMPORT_STATE, type ImportActionState } from "../contracts";
import { importFileKind } from "@/shared/domain/import-file";
import type { EmployeeResumeDraft } from "../../domain/resume-import";
import { EmployeeResumeEditor } from "./employee-resume-editor";
import { MAX_EMPLOYEE_IMPORT_BYTES } from "../../domain/policies";
import { importResumeFiles, type ResumeFileBatchResult } from "../../application/import-resume-files";
import { CANDIDATE_INTAKE_POLICY } from "@/modules/candidate-intake/domain/policies";

export function EmployeeImportForm({ onImported }: { onImported: () => Promise<void> }) {
  const [state, setState] = useState<ImportActionState>(INITIAL_IMPORT_STATE);
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [drafts, setDrafts] = useState<{ name: string; draft: EmployeeResumeDraft | null; error?: string }[]>([]);
  const [batch, setBatch] = useState<ResumeFileBatchResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const busy = useRef(false);
  const workbook = file && importFileKind(file.name) === "workbook";

  useEffect(() => {
    const preventNavigation = (event: globalThis.DragEvent) => { if (event.dataTransfer?.types.includes("Files")) event.preventDefault(); };
    window.addEventListener("dragover", preventNavigation);
    window.addEventListener("drop", preventNavigation);
    return () => { window.removeEventListener("dragover", preventNavigation); window.removeEventListener("drop", preventNavigation); };
  }, []);

  function showError(message: string) {
    setState({ ...INITIAL_IMPORT_STATE, status: "error", message });
  }

  async function importAutomatically(files: File[]) {
    if (busy.current) return;
    if (!files.length) { showError("未找到 PDF、DOC、DOCX 或 TXT 简历。"); return; }
    busy.current = true; setPending(true); setFile(null); setDrafts([]); setState(INITIAL_IMPORT_STATE); setBatch(null);
    try {
      const result = await importResumeFiles(files, { preview: api.previewEmployeeResume, publish: api.importEmployeeResumes, progress: setBatch });
      if (result.imported || result.interrupted) await onImported();
    } finally { busy.current = false; setPending(false); }
  }

  async function receiveFiles(files: File[]) {
    if (busy.current || !files.length) return;
    const kinds = files.map(item => importFileKind(item.name));
    if (kinds.some(kind => !kind)) { showError("支持 PDF、DOC、DOCX、TXT 简历或 .xlsx 员工表格。"); return; }
    if (kinds.includes("workbook") && files.length !== 1) { showError("Excel 请单独导入；多文件导入支持简历文件。"); return; }
    if (files.length > 1) { await importAutomatically(files); return; }
    if (files.some((item, index) => !item.size || item.size > (kinds[index] === "workbook" ? MAX_EMPLOYEE_IMPORT_BYTES : CANDIDATE_INTAKE_POLICY.maxFileBytes))) { showError("文件不能为空；简历最大 5 MB，Excel 最大 10 MB。"); return; }
    setBatch(null); setFile(files[0]); setDrafts([]); setState(INITIAL_IMPORT_STATE);
    if (kinds[0] === "workbook") return;
    busy.current = true; setPending(true);
    const results: { name: string; draft: EmployeeResumeDraft | null; error?: string }[] = [];
    try {
      for (const selected of files) {
        try {
          const result = await api.previewEmployeeResume(selected);
          results.push(result.kind === "parsed" ? { name: selected.name, draft: result.draft } : { name: selected.name, draft: null, error: result.message });
        } catch { results.push({ name: selected.name, draft: null, error: "简历读取失败，请检查文件后重试。" }); }
        setDrafts([...results]);
      }
    } finally { busy.current = false; setPending(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !file || (!workbook && (!drafts.length || drafts.some(item => !item.draft)))) return;
    busy.current = true;
    setPending(true);
    try {
      const result = workbook ? await api.importEmployees(file) : await api.importEmployeeResumes(drafts.map(item => item.draft!));
      setState(result);
      if (result.status === "success") { setFile(null); setDrafts([]); await onImported(); }
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof ApiError && error.status === 413 ? "简历资料总量过大，请分批导入。" : "请求失败，请稍后重试。",
        issues: [],
        totalIssueCount: 0,
        version: null,
      });
    } finally {
      setPending(false);
      busy.current = false;
    }
  }

  return (
    <div className="import-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">上传新版本</p>
          <h2>导入员工履历</h2>
        </div>
        <a className="secondary-link" href="/api/admin/employee-data/template">
          下载标准模板
        </a>
      </div>
      <form className="import-form" onSubmit={submit} aria-busy={pending}>
        <label className={`file-drop${dragging ? " is-dragging" : ""}`} htmlFor="employeeFile" aria-disabled={pending}
          onDragEnter={event => { if (!event.dataTransfer.types.includes("Files")) return; event.preventDefault(); dragDepth.current++; if (!busy.current) setDragging(true); }}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = busy.current ? "none" : "copy"; }}
          onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
          onDrop={event => { event.preventDefault(); dragDepth.current = 0; setDragging(false); void receiveFiles(Array.from(event.dataTransfer.files)); }}>
          <strong>{dragging ? "松开文件，自动识别简历或 Excel" : "拖入员工简历或 Excel，也可点击选择"}</strong>
          <span>PDF、DOC、DOCX、TXT 简历每份最大 5 MB；.xlsx 表格最大 10 MB。</span>
          <span>单份简历解析后可核对；多份简历将自动解析并导入。Excel 表格全部校验通过后生效。</span>
          <input className="sr-only" id="employeeFile" name="employeeFile" type="file" multiple accept=".pdf,.doc,.docx,.txt,.xlsx" disabled={pending} onChange={event => { void receiveFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
        </label>
        <label className="secondary-link" htmlFor="employeeFolder">选择文件夹并自动导入简历</label>
        <input className="sr-only" id="employeeFolder" type="file" multiple disabled={pending} ref={element => element?.setAttribute("webkitdirectory", "")} onChange={event => { const files = Array.from(event.currentTarget.files ?? []).filter(item => importFileKind(item.name) === "resume"); event.currentTarget.value = ""; void importAutomatically(files); }} />
        {batch ? <section aria-live="polite"><p>{pending ? "正在处理" : "处理完成"}：{batch.processed} / {batch.total}，已导入 {batch.imported} 份，失败 {batch.failures.length} 份。</p>{batch.interrupted ? <p role="alert">{batch.interrupted}</p> : null}{batch.failures.length ? <details><summary>查看未导入文件及原因</summary><ul>{batch.failures.map((item, index) => <li key={`${index}:${item.name}`}>{item.name}：{item.message}</li>)}</ul></details> : null}</section> : null}
        {file && workbook ? <p role="status">已选择：{file.name} · 多人 Excel</p> : null}
        {drafts.map((item, index) => <section key={`${index}:${item.name}`}>
          <p><strong>简历 {index + 1}：{item.name}</strong> <button className="text-button" type="button" disabled={pending} onClick={() => setDrafts(current => current.filter((_, i) => i !== index))}>移除</button></p>
          {item.draft ? <EmployeeResumeEditor draft={item.draft} onChange={draft => setDrafts(current => current.map((entry, i) => i === index ? { ...entry, draft } : entry))} disabled={pending} /> : <p role="alert">{item.error}</p>}
        </section>)}
        <button className="primary-button" disabled={pending || !file || (!workbook && (!drafts.length || drafts.some(item => !item.draft)))} type="submit">
          {pending ? "正在处理…" : workbook ? "校验并发布多人数据" : "确认并加入员工库"}
        </button>
      </form>
      <p className="schema-note">简历导入会加入现有员工库，不覆盖已有员工。批量导入按文件处理，解析或校验失败的文件会列出原因。Excel 请提供完整员工名单：发布后整体替代当前匹配数据；旧版本保留供复核。</p>
      {state.status !== "idle" ? (
        <section
          className={`import-result import-result-${state.status}`}
          aria-live="polite"
          aria-labelledby="import-result-title"
        >
          <div>
            <p className="eyebrow">导入结果</p>
            <h3 id="import-result-title">{state.message}</h3>
          </div>
          {state.version ? (
            <dl className="result-metrics">
              <div><dt>版本号</dt><dd>{state.version.id}</dd></div>
              <div><dt>员工</dt><dd>{state.version.employeeCount}</dd></div>
              <div><dt>工作经历</dt><dd>{state.version.workExperienceCount}</dd></div>
              <div><dt>教育经历</dt><dd>{state.version.educationCount}</dd></div>
            </dl>
          ) : null}
          {state.warnings?.length ? <ul>{state.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul> : null}
          {state.issues.length > 0 ? (
            <div className="error-table-wrap">
              <p className="error-summary">
                共发现 {state.totalIssueCount} 个问题
                {state.totalIssueCount > state.issues.length
                  ? `，仅显示前 ${state.issues.length} 个`
                  : ""}
              </p>
              <table className="data-table error-table">
                <thead><tr><th>工作表</th><th>行</th><th>字段</th><th>修正建议</th></tr></thead>
                <tbody>
                  {state.issues.map((issue, index) => (
                    <tr key={`${issue.sheet}-${issue.row}-${issue.field}-${issue.code}-${index}`}>
                      <td>{issue.sheet}</td>
                      <td>{issue.row || "—"}</td>
                      <td><code>{issue.field}</code></td>
                      <td>{issue.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
