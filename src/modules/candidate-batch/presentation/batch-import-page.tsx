import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Files, Upload, X, Network } from "lucide-react";
import { api } from "@/client/api";
import { WorkspaceHeader } from "@/components/workspace-header";
import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import { BATCH_LIMITS } from "../domain/models";
import { CANDIDATE_WORKBOOK_LIMITS } from "../domain/workbook";
import { useBatchTask } from "./use-batch-task";
import { BatchProgress } from "./batch-progress";
import { useWorkbookReport } from "./use-workbook-report";

export function BatchImportPage({ user, onLogout }: { user: AuthenticatedUser; onLogout: () => Promise<void> }) {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"files" | "workbook">("files");
  const [matchAfterImport, setMatchAfterImport] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const task = useBatchTask();
  const exportTask = useWorkbookReport();
  const busy = task.running || exportTask.pending;
  useEffect(() => {
    // Prevent a drop outside the upload area from navigating away from the current batch.
    const preventFileNavigation = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => { window.removeEventListener("dragover", preventFileNavigation); window.removeEventListener("drop", preventFileNavigation); };
  }, []);
  function selectFiles(selected: File[]) {
    setFiles(selected);
    setSubmitted(false);
    exportTask.reset();
  }
  function dropFiles(event: DragEvent<HTMLLabelElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (busy) return;
    selectFiles(Array.from(event.dataTransfer.files));
    if (input.current) input.current.value = "";
  }
  const bytes = files.reduce((total, file) => total + file.size, 0);
  const selectionError = mode === "workbook"
    ? files.length > 1 ? "每批请选择一份 Excel。" : files.some(file => !file.name.toLowerCase().endsWith(".xlsx")) ? "仅支持 .xlsx 文件。" : bytes > CANDIDATE_WORKBOOK_LIMITS.maxBytes ? "Excel 文件不能超过 10 MB。" : ""
    : files.some(file => !/\.(pdf|docx|txt)$/iu.test(file.name)) ? "简历文件仅支持 PDF、DOCX、TXT；Excel 请切换到表格模式。" : files.length > BATCH_LIMITS.maxFiles ? "每批最多 50 份简历，请分批上传。" : bytes > BATCH_LIMITS.maxTotalBytes ? "每批总大小不能超过 25 MB，请移除部分文件。" : "";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || submitted || !files.length || selectionError) return;
    setSubmitted(true);
    exportTask.reset();
    const outcome = await task.run((onEvent, signal) => mode === "workbook" ? api.importCandidateWorkbook(files[0], true, onEvent, signal) : api.importCandidates(files, matchAfterImport, onEvent, signal));
    if (mode === "workbook" && outcome?.items.length) {
      const report = { sourceName: files[0].name, items: outcome.items, total: outcome.total };
      exportTask.remember(report);
      if (outcome.complete) await exportTask.create(report);
    }
  }
  return <main className="app-shell"><WorkspaceHeader user={user} onLogout={onLogout} /><section className="workspace batch-workspace">
    <div className="workspace-heading"><div><p className="eyebrow">批量候选人工作台</p><h1>一次导入，多位候选人</h1><p>批量解析简历，可同时查找可能认识候选人的内部同事。</p></div><a className="secondary-link" href="/candidates">从候选人库批量匹配 →</a></div>
    <div className="batch-layout"><section className="import-panel"><div className="section-heading"><div><p className="eyebrow">01 · 选择资料</p><h2>{mode === "workbook" ? "从 Excel 导入候选人" : "上传多份简历"}</h2></div><Files size={24} /></div>
      <fieldset className="batch-import-mode" disabled={busy}><legend>选择导入方式</legend>{([["files", "多份简历文件"], ["workbook", "Excel 候选人表格"]] as const).map(([value, label]) => <label key={value}><input type="radio" name="import-mode" value={value} checked={mode === value} onChange={() => { setMode(value); setFiles([]); setSubmitted(false); exportTask.reset(); if (input.current) input.current.value = ""; }} />{label}</label>)}</fieldset>
      {mode === "workbook" ? <div className="batch-workbook-guide"><a className="secondary-link" href="/api/candidate-batch/template" download>下载填写示例（也可直接上传自己的表格）</a><p>自动识别常见中英文列名和前 20 行中的表头，列顺序不限，无关列自动忽略。每行一位候选人，整个文件最多 1,000 条；姓名必填。</p><p>工作经历、教育经历支持整段文字，也支持“公司、职位、入职时间、离职时间”和“学校、专业、入学时间、毕业时间”分列。多段经历可用“公司1、职位1、公司2、职位2”或“学校1、专业1、学校2、专业2”。缺少的信息不会自动补造。</p><p>整份简历有内容时优先使用简历内容；同一段经历有整段文字时优先使用该文字。多个含候选人表头的工作表会一起导入，结果标出工作表和行号。导入会新增候选人，重复上传会产生重复记录；不读取嵌入附件、图片或简历链接。</p></div> : null}
      <form onSubmit={submit}>
        <label className={`batch-drop${dragging ? " is-dragging" : ""}`} htmlFor="batch-files"
          onDragEnter={(event) => { if (!event.dataTransfer.types.includes("Files")) return; event.preventDefault(); dragDepth.current++; if (!busy) setDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? "none" : "copy"; }}
          onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
          onDrop={dropFiles}>
          <Upload size={30} /><strong>{dragging ? "松开鼠标选择文件" : mode === "workbook" ? "拖入 Excel，或点击选择" : "拖入多份简历，或点击选择"}</strong><span>{mode === "workbook" ? ".xlsx · 最大 10 MB" : "PDF、DOCX、UTF-8 TXT · 每份最大 5 MB"}</span><small>{mode === "workbook" ? "自动识别姓名、工作与教育经历等字段，无需先改成模板格式。" : "每批最多 50 份，总大小不超过 25 MB；扫描 PDF 请先转换为文本。"}</small><input ref={input} id="batch-files" type="file" accept={mode === "workbook" ? ".xlsx" : ".pdf,.docx,.txt"} multiple={mode === "files"} disabled={busy} onChange={(event) => selectFiles(Array.from(event.target.files ?? []))} /></label>
        {files.length ? <><div className="batch-file-heading"><strong>已选择 {files.length} 份 · {(bytes / 1024 / 1024).toFixed(2)} MB</strong><button className="text-button" type="button" disabled={busy} onClick={() => { setFiles([]); setSubmitted(false); exportTask.reset(); if (input.current) input.current.value = ""; }}>清空</button></div><ul className="batch-files">{files.map((file, index) => <li key={`${file.name}-${index}`}><Files size={16} /><span title={file.name}>{file.name}<small>{(file.size / 1024).toFixed(0)} KB{file.size > (mode === "workbook" ? CANDIDATE_WORKBOOK_LIMITS.maxBytes : 5 * 1024 * 1024) ? " · 超过单份上限" : ""}</small></span><button type="button" className="ai-icon-button" disabled={busy} aria-label={`移除 ${file.name}`} onClick={() => { setFiles((current) => current.filter((_, i) => i !== index)); setSubmitted(false); exportTask.reset(); }}><X size={16} /></button></li>)}</ul></> : null}
        {mode === "workbook" ? <p className="batch-help">导入后自动识别、匹配并下载结果 Excel；联系方式使用员工库中的邮箱。请保持页面打开。</p> : <label className="batch-match-option"><input type="checkbox" checked={matchAfterImport} disabled={busy} onChange={(event) => setMatchAfterImport(event.target.checked)} /><span><strong>导入后立即批量匹配</strong><small>使用当前生效的员工数据；未导入员工时，先保存简历，之后可在候选人库批量匹配。</small></span></label>}
        {selectionError ? <p className="form-error" role="alert">{selectionError}</p> : null}
        <button type="submit" className="primary-button" disabled={!files.length || Boolean(selectionError) || busy || submitted}>{task.running ? "正在处理…" : submitted ? "已提交本批文件" : mode === "workbook" ? "导入、匹配并下载 Excel" : matchAfterImport ? "导入并批量匹配" : "批量导入并解析"}</button>
        {submitted && !task.running ? <p className="batch-help">要继续导入，请重新选择文件。已保存的记录可直接在候选人库重试匹配。</p> : null}
      </form>
    </section><aside className="batch-guide"><Network size={25} /><h2>让每份简历都有明确结果</h2><ol><li><strong>独立校验与解析</strong><p>单份文件失败不会影响其他候选人。</p></li><li><strong>依据共同经历匹配</strong><p>结果保留置信度和可核验的证据，推荐仅表示“可能认识”。</p></li><li><strong>随时复核</strong><p>成功保存的资料进入你的候选人库，保留 7 天。</p></li></ol>{user.role === "HR_ADMIN" ? <a className="secondary-link" href="/admin/employee-data">先批量导入员工数据 →</a> : null}</aside></div>
    <BatchProgress task={task} />
    {exportTask.report ? <section className="batch-progress" aria-label="导出 Excel 匹配结果">
      <h2>Excel 匹配结果</h2>
      <p>汇总表按候选人显示高、中、低置信度的员工姓名与邮箱，员工明细表保留全部匹配员工。</p>
      {exportTask.report.items.length < exportTask.report.total ? <p className="parse-warning">本批未全部完成，仅可导出已处理的 {exportTask.report.items.length} / {exportTask.report.total} 位；未处理项不在结果表中。</p> : null}
      {exportTask.pending ? <p role="status">正在生成 Excel，请稍候…</p> : null}
      {exportTask.error ? <p className="form-error" role="alert">{exportTask.error}</p> : null}
      {exportTask.file ? <><p role="status">结果文件已生成并发起下载。如果没有自动下载，可点击下方链接。</p><a className="secondary-link" href={exportTask.file.url} download={exportTask.file.name}>下载匹配结果 Excel</a></> : <button className="primary-button" type="button" disabled={busy} onClick={() => void exportTask.create()}>{exportTask.pending ? "正在生成…" : "导出已处理结果 Excel"}</button>}
    </section> : null}
  </section></main>;
}
