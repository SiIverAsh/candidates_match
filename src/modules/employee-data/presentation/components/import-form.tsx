import { type FormEvent, useEffect, useRef, useState } from "react";

import { api } from "@/client/api";
import { INITIAL_IMPORT_STATE, type ImportActionState } from "../contracts";
import { importFileKind } from "@/shared/domain/import-file";
import type { EmployeeResumeDraft } from "../../domain/resume-import";
import { EmployeeResumeEditor } from "./employee-resume-editor";
import { MAX_EMPLOYEE_IMPORT_BYTES } from "../../domain/policies";
import { CANDIDATE_INTAKE_POLICY } from "@/modules/candidate-intake/domain/policies";

export function EmployeeImportForm({ onImported }: { onImported: () => Promise<void> }) {
  const [state, setState] = useState<ImportActionState>(INITIAL_IMPORT_STATE);
  const [pending, setPending] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<EmployeeResumeDraft | null>(null);
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

  async function receiveFiles(files: File[]) {
    if (busy.current || !files.length) return;
    if (files.length !== 1) { showError("一次请选择一份员工简历或一份 Excel；多人资料请使用 Excel。"); return; }
    const selected = files[0];
    const kind = importFileKind(selected.name);
    if (!kind) { showError("支持 PDF、DOC、DOCX、TXT 单人简历，或 .xlsx 多人员工表格。"); return; }
    const maxBytes = kind === "workbook" ? MAX_EMPLOYEE_IMPORT_BYTES : CANDIDATE_INTAKE_POLICY.maxFileBytes;
    if (!selected.size || selected.size > maxBytes) { showError(kind === "workbook" ? "Excel 不能为空，最大 10 MB。" : "简历不能为空，最大 5 MB。"); return; }
    setFile(selected); setDraft(null); setState(INITIAL_IMPORT_STATE);
    if (kind === "workbook") return;
    busy.current = true; setPending(true);
    try {
      const result = await api.previewEmployeeResume(selected);
      if (result.kind === "parsed") setDraft(result.draft);
      else showError(result.message);
    } catch { showError("简历读取失败，请检查文件后重试。"); }
    finally { busy.current = false; setPending(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !file || (!workbook && !draft)) return;
    busy.current = true;
    setPending(true);
    try {
      const result = workbook ? await api.importEmployees(file) : await api.importEmployeeResume(draft!);
      setState(result);
      if (result.status === "success") { setFile(null); setDraft(null); await onImported(); }
    } catch {
      setState({
        status: "error",
        message: "请求失败，请稍后重试。",
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
          <strong>{dragging ? "松开文件，自动识别单人或多人" : "拖入员工简历或 Excel，也可点击选择"}</strong>
          <span>PDF、DOC、DOCX、TXT 为单人简历，最大 5 MB；.xlsx 为多人员工表格，最大 10 MB。</span>
          <span>单人解析后核对资料再导入；多人表格最多 10,000 位员工，全部校验通过后生效。</span>
          <input className="sr-only" id="employeeFile" name="employeeFile" type="file" accept=".pdf,.doc,.docx,.txt,.xlsx" disabled={pending} onChange={event => { void receiveFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
        </label>
        {file ? <p role="status">已选择：{file.name} · {workbook ? "多人 Excel" : "单人简历"}</p> : null}
        {draft ? <EmployeeResumeEditor draft={draft} onChange={setDraft} disabled={pending} /> : null}
        <button className="primary-button" disabled={pending || !file || (!workbook && !draft)} type="submit">
          {pending ? "正在处理…" : workbook ? "校验并发布多人数据" : "确认并加入员工库"}
        </button>
      </form>
      <p className="schema-note">单人简历导入会加入现有员工库，不覆盖已有员工。Excel 请提供完整员工名单：发布后整体替代当前匹配数据；旧版本保留供复核。</p>
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
