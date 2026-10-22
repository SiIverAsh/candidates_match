import { useEffect, useState, type FormEvent } from "react";
import { Search, RotateCcw, Users, Network, FileText, ChevronRight, Inbox } from "lucide-react";
import { api } from "@/client/api";
import { WorkspaceHeader } from "@/components/workspace-header";
import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import type { CandidateQueryPage, CandidateQuerySummary } from "../../domain/models";
import { CANDIDATE_PARSE_STATUSES, CANDIDATE_SOURCE_FORMATS, CANDIDATE_MATCH_STATUSES, type CandidateColumnFilters } from "../../domain/column-filters";
import { CandidateDetailDrawer } from "../components/candidate-detail-drawer";
import { DateColumnFilter, OptionColumnFilter, TextColumnFilter } from "../components/column-filter";
import { useBatchTask } from "@/modules/candidate-batch/presentation/use-batch-task";
import { BatchProgress } from "@/modules/candidate-batch/presentation/batch-progress";
import { BATCH_LIMITS } from "@/modules/candidate-batch/domain/models";
import { CANDIDATE_FUNCTION_FILTERS, CANDIDATE_FUNCTION_LABELS } from "../../domain/possible-functions";
import { PossibleFunctionsCell } from "../components/possible-functions-cell";

const PARSE_LABELS = { COMPLETE: "解析完整", PARTIAL: "部分解析", INSUFFICIENT: "信息不足", FAILED: "解析失败", PENDING: "待解析" };
const SOURCE_LABELS = { pdf: "PDF", doc: "DOC", docx: "DOCX", txt: "TXT", "plain-text": "文本 / Excel" };
const MATCH_LABELS = { FOUND: "已找到匹配", NO_RESULTS: "未找到匹配", INSUFFICIENT: "信息不足，未匹配", PENDING: "尚未生成匹配" };
const PARSE_OPTIONS = CANDIDATE_PARSE_STATUSES.map(value => ({ value, label: PARSE_LABELS[value] }));
const SOURCE_OPTIONS = CANDIDATE_SOURCE_FORMATS.map(value => ({ value, label: SOURCE_LABELS[value] }));
const MATCH_OPTIONS = CANDIDATE_MATCH_STATUSES.map(value => ({ value, label: MATCH_LABELS[value] }));
const FUNCTION_OPTIONS = CANDIDATE_FUNCTION_FILTERS.map(value => ({ value, label: CANDIDATE_FUNCTION_LABELS[value] }));
function formatDate(value: string) { return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }); }
function sourceLabel(format: string) { return SOURCE_LABELS[format as keyof typeof SOURCE_LABELS] ?? format.toUpperCase(); }

export function CandidateLibraryPage({ user, onLogout, resultsOnly = false }: { user: AuthenticatedUser; onLogout: () => Promise<void>; resultsOnly?: boolean }) {
  const [data, setData] = useState<CandidateQueryPage | null>(null);
  const [otherTotal, setOtherTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [filters, setFilters] = useState<CandidateColumnFilters>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<"matching" | "functions">("matching");
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const batchTask = useBatchTask();
  const filterCount = [filters.name, filters.possibleFunctions, filters.submittedBy, filters.parseStatuses, filters.sourceFormats, filters.matchStatuses, filters.submittedFrom || filters.submittedTo, filters.expiresFrom || filters.expiresTo].filter(Boolean).length;
  const filterDisabled = loading || batchTask.running;
  function openCandidate(id: string, tab: "matching" | "functions" = "matching") { setSelectedId(id); setSelectedTab(tab); }

  async function matchSelected() {
    await batchTask.run((onEvent, signal) => api.matchCandidates(checkedIds, onEvent, signal));
    setLoading(true); setPage(1); setRetry(value => value + 1);
  }
  function toggleChecked(id: string) {
    setCheckedIds(current => current.includes(id) ? current.filter(value => value !== id) : current.length < BATCH_LIMITS.maxQueryIds ? [...current, id] : current);
  }
  useEffect(() => {
    let active = true;
    api.candidates(page, search, resultsOnly, undefined, filters).then(value => { if (active) { setData(value); setError(false); } })
      .catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, resultsOnly, filters, retry]);
  useEffect(() => {
    let active = true;
    api.candidates(1, search, !resultsOnly, undefined, filters).then(value => { if (active) setOtherTotal(value.total); }).catch(() => { if (active) setOtherTotal(null); });
    return () => { active = false; };
  }, [search, resultsOnly, filters, retry]);

  function searchRecords(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setPage(1); setSearch(input.trim()); setRetry(value => value + 1);
  }
  function clearSearch() {
    setLoading(true); setInput(""); setPage(1); setSearch(""); setRetry(value => value + 1);
  }
  function changePage(value: number) { setLoading(true); setPage(value); }
  function applyFilters(patch: Partial<CandidateColumnFilters>) {
    setLoading(true); setPage(1); setFilters(current => ({ ...current, ...patch }));
  }
  function resetFilters() { setLoading(true); setPage(1); setFilters({}); }

  const items = data?.items ?? [];
  const allTotal = resultsOnly ? otherTotal : data?.total;
  const matchedTotal = resultsOnly ? data ? data.resultCounts.found + data.resultCounts.notFound : null : otherTotal;
  function matchLabel(item: CandidateQuerySummary) {
    if (!item.matching) return "尚未生成";
    if (item.matching.status === "SKIPPED_INSUFFICIENT") return "信息不足，未匹配";
    return item.matching.resultCount ? `${item.matching.resultCount} 位内部同事` : "未找到可用匹配";
  }

  return <main className="app-shell ats-library">
    <WorkspaceHeader user={user} onLogout={onLogout}>
      <form className="ats-global-search" onSubmit={searchRecords}><label className="sr-only" htmlFor="candidate-search">模糊搜索候选人姓名、编号、公司、职位、职能、学校或专业</label><input id="candidate-search" type="search" aria-describedby="candidate-search-help" placeholder="姓名、公司、职能、学校…" value={input} maxLength={100} onChange={event => setInput(event.target.value)} /><button type="submit" aria-label="搜索候选人" disabled={loading}><Search size={16} /></button></form>
    </WorkspaceHeader>
    <nav className="ats-pipeline" aria-label="候选人记录分类">
      <div className="pipeline-label"><Users size={16} /><span>候选人简历库</span><ChevronRight size={14} /></div>
      <a href="/candidates" className={!resultsOnly ? "active" : ""} aria-current={!resultsOnly ? "page" : undefined}><strong>{loading ? "—" : allTotal ?? "—"}</strong><span>全部候选人</span></a>
      <a href="/results" className={resultsOnly ? "active" : ""} aria-current={resultsOnly ? "page" : undefined}><strong>{loading ? "—" : matchedTotal ?? "—"}</strong><span>匹配结果</span></a>
      <div className="pipeline-note"><FileText size={14} />招聘团队共享资料</div>
    </nav>
    <div className="ats-library-body">
      <section className="ats-candidate-panel ats-column-filter-panel" aria-label={resultsOnly ? "匹配结果历史" : "候选人列表"}>
        <div className="ats-list-toolbar">
          <div className="candidate-list-heading">
            <h1>{resultsOnly ? "匹配结果历史" : "候选人列表"}<span>{loading ? "正在加载…" : data ? `${data.total} 条记录` : ""}</span></h1>
            <p className="library-search-hint" id="candidate-search-help">姓名、公司、职能等关键词可用空格组合；表头筛选全部记录。</p>
          </div>
          <div className="column-filter-toolbar"><small>{filterCount ? `已筛选 ${filterCount} 列` : "全部显示 · 表头筛选"}</small>{search ? <button className="text-button" type="button" disabled={loading} onClick={clearSearch}>清空搜索</button> : null}{filterCount ? <button className="text-button" type="button" disabled={filterDisabled} onClick={resetFilters}><RotateCcw size={13} />清除列筛选</button> : null}</div>
        </div>
        <div className="batch-selection-bar"><span>已选 <strong>{checkedIds.length}</strong> 位<small>可跨页 · 最多 200 位</small></span><button type="button" className="text-button" disabled={!checkedIds.length || batchTask.running} onClick={() => setCheckedIds([])}>清空选择</button><button type="button" className="primary-button" disabled={!checkedIds.length || batchTask.running} onClick={() => void matchSelected()}><Network size={14} />{batchTask.running ? "正在匹配…" : "匹配所选候选人"}</button><a className="secondary-link" href="/candidates/import">多人匹配</a></div>
        <BatchProgress task={batchTask} />
        <div className="ats-table-scroll"><table className="data-table ats-candidate-table">
          <thead><tr>
            <th className="batch-checkbox-cell"><input aria-label="选择本页可见候选人" type="checkbox" disabled={loading || batchTask.running || !items.length} checked={items.length > 0 && items.every(item => checkedIds.includes(item.id))} onChange={event => setCheckedIds(current => event.target.checked ? [...new Set([...current, ...items.map(item => item.id)])].slice(0, BATCH_LIMITS.maxQueryIds) : current.filter(id => !items.some(item => item.id === id)))} /></th>
            <th><TextColumnFilter label="候选人基本资料" value={filters.name} disabled={filterDisabled} onChange={name => applyFilters({ name })} /></th>
            <th className="possible-functions-column"><OptionColumnFilter label="可能职能" options={FUNCTION_OPTIONS} values={filters.possibleFunctions} disabled={filterDisabled} onChange={possibleFunctions => applyFilters({ possibleFunctions })} /></th>
            <th><TextColumnFilter label="导入人" value={filters.submittedBy} placeholder="输入导入人名称或账号 ID" disabled={filterDisabled} onChange={submittedBy => applyFilters({ submittedBy })} /></th>
            <th><DateColumnFilter label="提交时间" value={{ from: filters.submittedFrom, to: filters.submittedTo }} disabled={filterDisabled} onChange={value => applyFilters({ submittedFrom: value.from, submittedTo: value.to })} /></th>
            <th><OptionColumnFilter label="解析状态" options={PARSE_OPTIONS} values={filters.parseStatuses} disabled={filterDisabled} onChange={parseStatuses => applyFilters({ parseStatuses })} /></th>
            <th><OptionColumnFilter label="简历来源" options={SOURCE_OPTIONS} values={filters.sourceFormats} disabled={filterDisabled} onChange={sourceFormats => applyFilters({ sourceFormats })} /></th>
            <th className="match-column"><OptionColumnFilter label="内部人脉匹配" options={resultsOnly ? MATCH_OPTIONS.filter(option => option.value !== "PENDING") : MATCH_OPTIONS} values={filters.matchStatuses} disabled={filterDisabled} onChange={matchStatuses => applyFilters({ matchStatuses })} /></th>
            <th><DateColumnFilter label="到期时间" value={{ from: filters.expiresFrom, to: filters.expiresTo }} disabled={filterDisabled} onChange={value => applyFilters({ expiresFrom: value.from, expiresTo: value.to })} /></th>
          </tr></thead>
          <tbody>{loading ? <tr><td colSpan={9}><div className="ats-empty" role="status">正在加载候选人…</div></td></tr> : error ? <tr><td colSpan={9}><div className="ats-empty" role="alert"><p>记录加载失败，请重试。</p><button className="primary-button" type="button" onClick={() => { setLoading(true); setRetry(value => value + 1); }}>重新加载</button></div></td></tr> : items.length ? items.map(item => <tr key={item.id} onClick={() => openCandidate(item.id)}>
            <td className="batch-checkbox-cell" onClick={event => event.stopPropagation()}><input aria-label={`选择 ${item.candidateName ?? item.id}`} type="checkbox" checked={checkedIds.includes(item.id)} disabled={batchTask.running || (!checkedIds.includes(item.id) && checkedIds.length >= BATCH_LIMITS.maxQueryIds)} onChange={() => toggleChecked(item.id)} /></td>
            <td><div className="candidate-cell"><span className="candidate-avatar" aria-hidden="true">{(item.candidateName ?? "候").slice(0, 1)}</span><div><button className="candidate-name" type="button" onClick={event => { event.stopPropagation(); openCandidate(item.id); }}>{item.candidateName ?? "姓名未识别"}</button><small className="table-subtitle" title={item.id}>查询编号 · {item.id}</small><a className="candidate-detail-link" href={`/candidates/${encodeURIComponent(item.id)}`} onClick={event => event.stopPropagation()}>完整简历 <ChevronRight size={11} /></a></div></div></td>
            <td className="possible-functions-column"><PossibleFunctionsCell summary={item.possibleFunctions} onOpen={() => openCandidate(item.id, "functions")} /></td>
            <td className="importer-cell" title={`首次导入人账号：${item.submittedBy}`}>{item.submittedByName || item.submittedBy}</td>
            <td className="date-cell">{formatDate(item.submittedAt)}</td>
            <td><span className={`parse-badge ${(item.parseStatus ?? "PENDING").toLowerCase()}`}>{PARSE_LABELS[item.parseStatus ?? "PENDING"]}</span></td>
            <td><span className="source-badge">{sourceLabel(item.sourceFormat)}</span></td>
            <td className="match-column"><button className="match-preview-button" type="button" onClick={event => { event.stopPropagation(); openCandidate(item.id); }}><Network size={14} /><strong>{matchLabel(item)}</strong><ChevronRight size={13} /></button><small className="table-subtitle">{item.matching?.resultCount ? "查看置信度与共同经历" : "查看资料与处理状态"}</small></td>
            <td className="date-cell">{formatDate(item.expiresAt)}</td>
          </tr>) : <tr><td colSpan={9}><div className="ats-empty"><Inbox size={32} /><h2>{filterCount || search ? "没有符合条件的候选人" : resultsOnly ? "暂无匹配结果" : "暂无候选人记录"}</h2><p>{filterCount ? "可修改表头筛选条件，或清除全部列筛选后查看。" : search ? "试试其他关键词，或清空搜索查看全部记录。" : "上传候选人简历开始匹配。"}</p>{filterCount ? <button className="text-button" type="button" onClick={resetFilters}>清除全部列筛选</button> : search ? <button className="text-button" type="button" onClick={clearSearch}>清空搜索</button> : <a className="button-link" href="/candidates/new">开始匹配</a>}</div></td></tr>}</tbody>
        </table></div>
        {data && !error ? <div className="library-pagination"><small>共 {data.total} 条 · 每页 {data.pageSize} 条</small><button className="text-button" disabled={page <= 1 || loading} onClick={() => changePage(page - 1)} type="button">上一页</button><span>第 {page} / {Math.max(1, Math.ceil(data.total / data.pageSize))} 页</span><button className="text-button" disabled={page * data.pageSize >= data.total || loading} onClick={() => changePage(page + 1)} type="button">下一页</button></div> : null}
      </section>
    </div>
    {selectedId ? <CandidateDetailDrawer key={`${selectedId}:${selectedTab}`} queryId={selectedId} initialTab={selectedTab} onClose={() => setSelectedId(null)} /> : null}
  </main>;
}
