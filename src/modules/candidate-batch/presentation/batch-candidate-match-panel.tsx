import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Download, Files, FileSpreadsheet, FolderOpen, Upload, X } from "lucide-react";
import { api } from "@/client/api";
import { BATCH_LIMITS } from "../domain/models";
import { CANDIDATE_WORKBOOK_LIMITS } from "../domain/workbook";
import { useBatchTask } from "./use-batch-task";
import { BatchProgress } from "./batch-progress";
import { useWorkbookReport } from "./use-workbook-report";

export function BatchCandidateMatchPanel({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<"files" | "workbook">("workbook");
  const [submitted, setSubmitted] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const input = useRef<HTMLInputElement>(null);
  const task = useBatchTask();
  const exportTask = useWorkbookReport();
  const busy = task.running || exportTask.pending;
  const workbook = mode === "workbook";

  useEffect(() => { onBusyChange(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    const preventFileNavigation = (event: globalThis.DragEvent) => {
      if (event.dataTransfer?.types.includes("Files")) event.preventDefault();
    };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, []);

  function selectFiles(selected: File[]) {
    if (busy) return;
    setFiles(selected);
    setSubmitted(false);
    task.reset();
    exportTask.reset();
    if (input.current) input.current.value = "";
  }

  function changeMode(next: "files" | "workbook") {
    if (busy || mode === next) return;
    setMode(next);
    selectFiles([]);
  }

  function dropFiles(event: DragEvent<HTMLLabelElement>) {
    if (!event.dataTransfer.types.includes("Files")) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    selectFiles(Array.from(event.dataTransfer.files));
  }

  const bytes = files.reduce((total, file) => total + file.size, 0);
  const selectionError = workbook
    ? files.length > 1 ? "每批请选择一份 Excel。" : files.some(file => !file.name.toLowerCase().endsWith(".xlsx")) ? "仅支持 .xlsx 文件。" : bytes > CANDIDATE_WORKBOOK_LIMITS.maxBytes ? "Excel 文件不能超过 10 MB。" : ""
    : files.some(file => !/\.(pdf|docx|txt)$/iu.test(file.name)) ? "简历文件仅支持 PDF、DOCX、TXT；Excel 请切换到表格模式。" : files.length > BATCH_LIMITS.maxFiles ? "每批最多 50 份简历，请分批上传。" : bytes > BATCH_LIMITS.maxTotalBytes ? "每批总大小不能超过 25 MB。" : "";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || submitted || !files.length || selectionError) return;
    setSubmitted(true);
    exportTask.reset();
    const sourceName = workbook ? files[0].name : "多人简历";
    const outcome = await task.run((onEvent, signal) => workbook
      ? api.importCandidateWorkbook(files[0], true, onEvent, signal)
      : api.importCandidates(files, true, onEvent, signal));
    if (outcome?.items.length) {
      const report = { sourceName, items: outcome.items, total: outcome.total };
      exportTask.remember(report);
      if (outcome.complete) await exportTask.create(report);
    }
  }

  return <>
    <section className="matching-input-card" aria-labelledby="batch-match-title" aria-busy={busy}>
      <div className="matching-card-heading"><div><h2 id="batch-match-title">一次匹配多位候选人</h2><p>选择表格或多份简历，匹配完成后自动下载 Excel。</p></div><span className="matching-output-label"><Download size={14} />Excel 结果</span></div>
      <div className="matching-input-switch" role="group" aria-label="多人资料输入方式">
        <button type="button" disabled={busy} aria-pressed={workbook} onClick={() => changeMode("workbook")}><FileSpreadsheet size={15} />Excel 候选人表格</button>
        <button type="button" disabled={busy} aria-pressed={!workbook} onClick={() => changeMode("files")}><Files size={15} />多份简历文件</button>
      </div>
      <form onSubmit={submit}>
        <label className={`matching-drop${dragging ? " is-dragging" : ""}`} htmlFor="batch-match-files" aria-disabled={busy}
          onDragEnter={(event) => { if (!event.dataTransfer.types.includes("Files")) return; event.preventDefault(); dragDepth.current++; if (!busy) setDragging(true); }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = busy ? "none" : "copy"; }}
          onDragLeave={(event) => { event.preventDefault(); dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
          onDrop={dropFiles}>
          <span className="matching-upload-icon">{workbook ? <FileSpreadsheet size={27} /> : <FolderOpen size={27} />}</span>
          <strong>{dragging ? "松开鼠标，添加待匹配资料" : workbook ? "拖入候选人表格，一次匹配全部候选人" : "拖入多份简历，一次完成多人匹配"}</strong>
          <span>{workbook ? ".xlsx · 最大 10 MB · 不设候选人人数上限" : "PDF、DOCX、TXT · 最多 50 份 · 总大小不超过 25 MB"}</span>
          <span className="matching-choose-file"><Upload size={14} />{workbook ? "选择 Excel 文件" : "选择多份简历"}</span>
          <small>{workbook ? "支持自己的表格，无需先改成模板格式" : "每份最大 5 MB，选好后点击下方按钮开始"}</small>
          <input className="sr-only" ref={input} id="batch-match-files" type="file" accept={workbook ? ".xlsx" : ".pdf,.docx,.txt"} multiple={!workbook} disabled={busy} onChange={(event) => selectFiles(Array.from(event.target.files ?? []))} />
        </label>
        {files.length ? <div className="matching-file-selection">
          <div className="batch-file-heading"><strong>已选择 {files.length} 份资料 <span>· {(bytes / 1024 / 1024).toFixed(2)} MB</span></strong><button className="text-button" type="button" disabled={busy} onClick={() => selectFiles([])}>清空</button></div>
          <ul className="batch-files">{files.map((file, index) => <li key={`${file.name}-${index}`}><Files size={16} /><span title={file.name}>{file.name}<small>{(file.size / 1024).toFixed(0)} KB</small></span><button type="button" className="ai-icon-button" disabled={busy} aria-label={`移除 ${file.name}`} onClick={() => selectFiles(files.filter((_, i) => i !== index))}><X size={16} /></button></li>)}</ul>
        </div> : null}
        {selectionError ? <p className="form-error" role="alert">{selectionError}</p> : null}
        <div className="matching-submit-row"><button type="submit" className="primary-button" disabled={!files.length || Boolean(selectionError) || busy || submitted}><Download size={16} />{task.running ? "正在匹配…" : exportTask.pending ? "正在生成 Excel…" : submitted ? "本批资料已处理" : "开始匹配并下载 Excel"}</button><span>自动解析、逐人匹配、汇总结果</span></div>
        {submitted && !busy ? <p className="batch-help">继续处理下一批时，请重新选择资料；已有结果可在下方下载。</p> : null}
      </form>
      {workbook ? <details className="matching-workbook-help"><summary>查看 Excel 填写要求</summary><p>姓名必填，每行一人。系统识别前 20 行内的常见中英文表头，列顺序不限；工作、教育经历可整段填写，也可将公司、职位、学校、专业、起止时间分列。</p><p>多个含候选人表头的工作表会一起处理，结果保留来源工作表和行号。相同资料复用团队已有记录；不读取图片、嵌入附件或外部简历链接。</p></details> : null}
    </section>

    {exportTask.report ? <section className="matching-download-card" aria-label="下载多人匹配结果">
      <span className="matching-delivery-icon"><FileSpreadsheet size={24} /></span>
      <div><h2>{exportTask.pending ? "正在整理匹配结果" : exportTask.file ? "匹配结果 Excel 已生成" : "导出本批匹配结果"}</h2><p>{exportTask.file ? "已发起自动下载，也可以再次点击下载。" : "包含候选人汇总、完整员工明细，以及职能优先级、置信度和原文依据。"}</p>
        {exportTask.report.items.length < exportTask.report.total ? <p className="matching-partial-note" role="status">部分结果：已处理 {exportTask.report.items.length} / {exportTask.report.total} 位，未处理项不在结果表中。</p> : null}
        {exportTask.error ? <p className="form-error" role="alert">{exportTask.error}</p> : null}
      </div>
      {exportTask.file ? <a className="button-link" href={exportTask.file.url} download={exportTask.file.name}><Download size={16} />{exportTask.report.items.length < exportTask.report.total ? "下载已处理结果" : "下载匹配结果"}</a> : <button className="primary-button" type="button" disabled={busy} onClick={() => void exportTask.create()}><Download size={16} />{exportTask.pending ? "正在生成…" : exportTask.error ? "重试导出" : "导出已处理结果"}</button>}
    </section> : !task.running && !task.error ? <section className="matching-result-placeholder"><FileSpreadsheet size={25} /><h2>匹配完成后自动下载 Excel</h2><p>在一份表格中查看全部候选人的推荐同事与处理结果。</p></section> : null}
    <BatchProgress task={task} />
  </>;
}
