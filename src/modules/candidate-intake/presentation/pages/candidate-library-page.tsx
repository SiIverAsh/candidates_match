import { useEffect, useState, type FormEvent } from "react";
import { Search, Filter, RotateCcw, Users, Network, FileText, ChevronRight, Inbox } from "lucide-react";
import { api } from "@/client/api";
import { WorkspaceHeader } from "@/components/workspace-header";
import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import type { CandidateQueryPage, CandidateQuerySummary } from "../../domain/models";
import { CandidateDetailDrawer } from "../components/candidate-detail-drawer";

const PARSE_LABELS = { COMPLETE: "解析完整", PARTIAL: "部分解析", INSUFFICIENT: "信息不足", FAILED: "解析失败", PENDING: "待解析" };
function formatDate(value: string) { return new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }); }

export function CandidateLibraryPage({ user, onLogout, resultsOnly = false }: { user: AuthenticatedUser; onLogout: () => Promise<void>; resultsOnly?: boolean }) {
  const [data, setData] = useState<CandidateQueryPage | null>(null);
  const [otherTotal, setOtherTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [input, setInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [parseFilter, setParseFilter] = useState("ALL");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    api.candidates(page, search, resultsOnly).then((value) => { if (active) { setData(value); setError(false); } })
      .catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, resultsOnly, retry]);
  useEffect(() => {
    let active = true;
    api.candidates(1, search, !resultsOnly).then((value) => { if (active) setOtherTotal(value.total); }).catch(() => { if (active) setOtherTotal(null); });
    return () => { active = false; };
  }, [search, resultsOnly, retry]);
  function searchRecords(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setPage(1); setSearch(input.trim()); setRetry((value) => value + 1);
  }
  function changePage(value: number) { setLoading(true); setPage(value); }
  function resetFilters() { setParseFilter("ALL"); setSourceFilter("ALL"); }
  const items = data?.items.filter((item) => (parseFilter === "ALL" || (item.parseStatus ?? "PENDING") === parseFilter) && (sourceFilter === "ALL" || item.sourceType === sourceFilter)) ?? [];
  const allTotal = resultsOnly ? otherTotal : data?.total;
  const matchedTotal = resultsOnly ? data?.total : otherTotal;
  function parseCount(status: string) { return data?.items.filter((item) => (item.parseStatus ?? "PENDING") === status).length ?? 0; }
  function matchLabel(item: CandidateQuerySummary) {
    if (!item.matching) return "尚未生成";
    if (item.matching.status === "SKIPPED_INSUFFICIENT") return "信息不足，未匹配";
    return item.matching.resultCount ? `${item.matching.resultCount} 位内部同事` : "未找到可用匹配";
  }
  return (
    <main className="app-shell ats-library">
      <WorkspaceHeader user={user} onLogout={onLogout}>
        <form className="ats-global-search" onSubmit={searchRecords}><label className="sr-only" htmlFor="candidate-search">搜索姓名或查询编号</label><input id="candidate-search" placeholder="搜索姓名或查询编号…" value={input} maxLength={100} onChange={(event) => setInput(event.target.value)} /><button type="submit" aria-label="搜索候选人" disabled={loading}><Search size={16} /></button></form>
      </WorkspaceHeader>
      <nav className="ats-pipeline" aria-label="候选人记录分类">
        <div className="pipeline-label"><Users size={16} /><span>候选人简历库</span><ChevronRight size={14} /></div>
        <a href="/candidates" className={!resultsOnly ? "active" : ""} aria-current={!resultsOnly ? "page" : undefined}><strong>{loading ? "—" : allTotal ?? "—"}</strong><span>全部候选人</span></a>
        <a href="/results" className={resultsOnly ? "active" : ""} aria-current={resultsOnly ? "page" : undefined}><strong>{loading ? "—" : matchedTotal ?? "—"}</strong><span>已生成匹配</span></a>
        <div className="pipeline-note"><FileText size={14} />{search ? "当前搜索范围" : "仅显示你提交的资料"}</div>
      </nav>
      <div className="ats-library-body">
        <aside className="ats-filters" aria-label="候选人筛选">
          <div className="filter-heading"><strong><Filter size={14} />候选人筛选</strong><button type="button" className="text-button" onClick={resetFilters} title="重置本页筛选"><RotateCcw size={13} />重置</button></div>
          <fieldset className="filter-card"><legend>解析状态</legend><small>筛选当前页的记录</small>
            <label className={parseFilter === "ALL" ? "selected" : ""}><input type="radio" name="parse-state" checked={parseFilter === "ALL"} onChange={() => setParseFilter("ALL")} />全部状态<span>{data?.items.length ?? 0}</span></label>
            {Object.entries(PARSE_LABELS).map(([key, label]) => <label key={key} className={parseFilter === key ? "selected" : ""}><input type="radio" name="parse-state" checked={parseFilter === key} onChange={() => setParseFilter(key)} />{label}<span>{parseCount(key)}</span></label>)}
          </fieldset>
          <fieldset className="filter-card"><legend>简历来源</legend><label htmlFor="source-filter" className="sr-only">简历来源</label><select id="source-filter" value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="ALL">全部来源</option><option value="FILE">文件上传</option><option value="TEXT">文本粘贴</option></select></fieldset>
          <div className="filter-tip"><Network size={18} /><strong>共同经历，发现人脉</strong><p>打开候选人详情，查看内部同事推荐和可核验的共同经历。</p><small>候选人资料到期自动删除，保留期为 7 天。</small></div>
        </aside>
        <section className="ats-candidate-panel" aria-label={resultsOnly ? "匹配结果历史" : "候选人列表"}>
          <div className="ats-info-banner"><Network size={16} /><div><strong>内部人才库人脉匹配</strong><p>点击候选人查看简历与推荐依据，帮助找到可能认识该候选人的内部同事。</p></div></div>
          <div className="ats-list-toolbar"><h1>{resultsOnly ? "结果历史" : "候选人列表"}<span>{data ? `${data.total} 条记录` : ""}</span></h1><small>{parseFilter !== "ALL" || sourceFilter !== "ALL" ? `本页筛选后 ${items.length} 条` : "资料与人脉线索"}</small></div>
          {loading ? <div className="ats-empty" role="status">正在加载候选人…</div> : error ? <div className="ats-empty" role="alert"><p>记录加载失败，请重试。</p><button className="primary-button" type="button" onClick={() => { setLoading(true); setRetry((value) => value + 1); }}>重新加载</button></div> : data && items.length ? <div className="ats-table-scroll"><table className="data-table ats-candidate-table">
            <thead><tr><th>候选人基本资料</th><th>提交时间</th><th>解析状态</th><th>简历来源</th><th className="match-column">内部人脉匹配</th><th>到期时间</th></tr></thead>
            <tbody>{items.map((item) => <tr key={item.id} onClick={() => setSelectedId(item.id)}>
              <td><div className="candidate-cell"><span className="candidate-avatar" aria-hidden="true">{(item.candidateName ?? "候").slice(0, 1)}</span><div><button className="candidate-name" type="button" onClick={(event) => { event.stopPropagation(); setSelectedId(item.id); }}>{item.candidateName ?? "姓名未识别"}</button><small className="table-subtitle" title={item.id}>查询编号 · {item.id}</small><a className="candidate-detail-link" href={`/candidates/${encodeURIComponent(item.id)}`} onClick={(event) => event.stopPropagation()}>完整简历 <ChevronRight size={11} /></a></div></div></td>
              <td className="date-cell">{formatDate(item.submittedAt)}</td><td><span className={`parse-badge ${(item.parseStatus ?? "PENDING").toLowerCase()}`}>{PARSE_LABELS[item.parseStatus ?? "PENDING"]}</span></td>
              <td><span className="source-badge">{item.sourceType === "FILE" ? item.sourceFormat.toUpperCase() : "文本粘贴"}</span></td>
              <td className="match-column"><button className="match-preview-button" type="button" onClick={(event) => { event.stopPropagation(); setSelectedId(item.id); }}><Network size={14} /><strong>{matchLabel(item)}</strong><ChevronRight size={13} /></button><small className="table-subtitle">{item.matching?.resultCount ? "查看置信度与共同经历" : "查看资料与处理状态"}</small></td>
              <td className="date-cell">{formatDate(item.expiresAt)}</td>
            </tr>)}</tbody>
          </table></div> : <div className="ats-empty"><Inbox size={38} /><h2>{parseFilter !== "ALL" || sourceFilter !== "ALL" ? "本页没有符合筛选条件的记录" : search ? "没有找到匹配的候选人" : resultsOnly ? "暂无匹配结果历史" : "开始建立你的候选人简历库"}</h2><p>{parseFilter !== "ALL" || sourceFilter !== "ALL" ? "可重置筛选或切换页码查看其他记录。" : "上传简历或粘贴候选人经历，查找内部人脉线索。"}</p>{parseFilter !== "ALL" || sourceFilter !== "ALL" ? <button className="text-button" type="button" onClick={resetFilters}>重置筛选</button> : <a className="button-link" href="/candidate/new">添加候选人简历</a>}</div>}
          {data && !error ? <div className="library-pagination"><small>共 {data.total} 条 · 每页 {data.pageSize} 条</small><button className="text-button" disabled={page <= 1 || loading} onClick={() => changePage(page - 1)} type="button">上一页</button><span>第 {page} / {Math.max(1, Math.ceil(data.total / data.pageSize))} 页</span><button className="text-button" disabled={page * data.pageSize >= data.total || loading} onClick={() => changePage(page + 1)} type="button">下一页</button></div> : null}
        </section>
      </div>
      {selectedId ? <CandidateDetailDrawer key={selectedId} queryId={selectedId} onClose={() => setSelectedId(null)} /> : null}
    </main>
  );
}
