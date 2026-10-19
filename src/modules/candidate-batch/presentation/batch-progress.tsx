import { CheckCircle2, LoaderCircle } from "lucide-react";
import type { BatchItemStatus } from "../domain/models";
import type { useBatchTask } from "./use-batch-task";

const LABELS: Record<BatchItemStatus, string> = { IMPORTED: "已导入", MATCHED: "匹配完成", NO_RESULTS: "暂无匹配", NEEDS_DATA: "等待员工数据", NEEDS_INPUT: "需补充资料", FAILED: "处理失败" };
export function BatchProgress({ task }: { task: ReturnType<typeof useBatchTask> }) {
  if (!task.running && !task.total && !task.error) return null;
  const needsAttention = task.items.filter((item) => ["FAILED", "NEEDS_INPUT", "NEEDS_DATA"].includes(item.status)).length;
  return <section className="batch-progress" aria-label="批量处理进度">
    <div className="section-heading"><div><p className="eyebrow">处理进度</p><h2>{task.running ? <><LoaderCircle size={18} className="is-spinning" />正在逐条处理</> : task.finished ? <><CheckCircle2 size={18} />本批处理结束</> : "批次已中断"}</h2></div>{task.running ? <button type="button" className="text-button" onClick={task.stop}>停止处理</button> : <a className="secondary-link" href="/candidates">查看候选人库</a>}</div>
    <progress max={task.total || 1} value={task.items.length} aria-label="候选人处理进度" />
    <p className="batch-summary" role="status">已处理 {task.items.length} / {task.total || "—"} 位 · {needsAttention} 位需要处理{task.running ? " · 请保持此页面打开" : ""}</p>
    {task.error ? <p className="form-error" role="alert">{task.error}</p> : null}
    {task.items.length ? <div className="table-scroll"><table className="data-table"><thead><tr><th>文件 / Excel 行 / 候选人</th><th>状态</th><th>处理结果</th><th>操作</th></tr></thead><tbody>{task.items.map((item) => <tr key={item.index}><td className="batch-label">{item.label}</td><td><span className={`batch-status ${item.status.toLowerCase()}`}>{LABELS[item.status]}</span></td><td>{item.message}</td><td>{item.queryId ? <a className="secondary-link" href={item.status === "MATCHED" || item.status === "NO_RESULTS" ? `/results/${encodeURIComponent(item.queryId)}` : `/candidates/${encodeURIComponent(item.queryId)}`}>{item.status === "MATCHED" || item.status === "NO_RESULTS" ? "查看结果" : "查看简历"}</a> : "—"}</td></tr>)}</tbody></table></div> : null}
  </section>;
}
