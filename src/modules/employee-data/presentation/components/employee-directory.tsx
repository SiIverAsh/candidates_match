import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiError } from "@/client/api";
import type { EmployeeDirectoryPage, EmployeeRecord } from "../../domain/models";
import { EmployeeProfileDrawer } from "./employee-profile-drawer";

export function EmployeeDirectory({ onChanged, totalEmployees, overviewVersionId }: { onChanged: () => Promise<void>; totalEmployees: number; overviewVersionId: string | null }) {
  const [data, setData] = useState<EmployeeDirectoryPage | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const loadedVersion = useRef<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [selected, setSelected] = useState<{ employee: EmployeeRecord; versionId: string } | null>(null);
  useEffect(() => {
    let active = true;
    api.employees(page, search).then((value) => { if (active) { if (loadedVersion.current && loadedVersion.current !== value.versionId) setChecked([]); loadedVersion.current = value.versionId; setData(value); setError(false); } })
      .catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, retry]);
  function searchEmployees(event: FormEvent) {
    event.preventDefault(); setLoading(true); setPage(1); setSearch(input.trim()); setRetry((value) => value + 1);
  }
  function clearSearch() {
    setLoading(true); setInput(""); setPage(1); setSearch(""); setRetry((value) => value + 1);
  }
  function changePage(value: number) { setLoading(true); setPage(value); }
  async function deleteSelected(all = false) {
    if (!data?.versionId || (!all && !checked.length) || (all && !overviewVersionId) || deleting) return;
    const message = all ? `确认删除当前员工库全部 ${totalEmployees} 位员工？即使正在搜索，也会删除整个员工库。历史版本会保留。` : `确认从当前员工库删除选中的 ${checked.length} 位员工？历史版本会保留。`;
    if (!window.confirm(message)) return;
    setDeleting(true); setDeleteError("");
    try { await api.deleteEmployees(all ? overviewVersionId! : data.versionId, all ? null : checked); setChecked([]); await onChanged(); }
    catch (error) { setDeleteError(error instanceof ApiError ? error.message : "删除失败，请稍后重试。"); }
    finally { setDeleting(false); }
  }
  return (
    <section className="history-panel" aria-labelledby="employee-directory-title">
      <div className="section-heading"><div><h2 id="employee-directory-title">员工资料库</h2><p>查看当前生效版本中的员工资料与完整履历。</p></div><span>共 {data?.total ?? 0} 位</span></div>
      {totalEmployees > 0 ? <button className="text-button" type="button" disabled={loading || deleting || !data?.versionId} onClick={() => void deleteSelected(true)}>删除全部员工</button> : null}
      <form className="library-search" onSubmit={searchEmployees}><label htmlFor="employee-search">模糊搜索员工资料</label><input id="employee-search" type="search" aria-describedby="employee-search-help" placeholder="姓名、部门、公司、学校…" value={input} maxLength={100} onChange={(event) => setInput(event.target.value)} /><button className="primary-button" type="submit" disabled={loading || deleting}>搜索</button>{input || search ? <button className="text-button" type="button" disabled={loading || deleting} onClick={clearSearch}>清空</button> : null}</form>
      <p className="library-search-hint" id="employee-search-help">支持姓名、编号、邮箱、部门、职位、历史公司、学校和专业；多个词用空格分隔，需同时匹配。不区分大小写和全半角。</p>
      {checked.length ? <p>已选择 {checked.length} 位员工 <button type="button" className="text-button" disabled={deleting || loading} onClick={() => void deleteSelected()}>{deleting ? "正在删除…" : "批量删除"}</button> <button type="button" className="text-button" disabled={deleting} onClick={() => setChecked([])}>取消选择</button></p> : null}
      {deleteError ? <p className="form-error" role="alert">{deleteError}</p> : null}
      {loading ? <p role="status">正在加载员工资料…</p> : error ? <div className="form-error" role="alert"><p>员工列表加载失败，请重试。</p><button className="text-button" type="button" onClick={() => { setLoading(true); setRetry((value) => value + 1); }}>重新加载</button></div> : data?.items.length ? <>
        <div className="table-scroll"><table className="data-table"><thead><tr><th><input type="checkbox" aria-label="选择当前页全部员工" disabled={deleting} checked={data.items.every(employee => checked.includes(employee.employeeId))} onChange={event => setChecked(current => event.target.checked ? Array.from(new Set([...current, ...data.items.map(employee => employee.employeeId)])) : current.filter(id => !data.items.some(employee => employee.employeeId === id)))} /></th><th>员工</th><th>部门</th><th>职位</th><th>邮箱</th><th>操作</th></tr></thead><tbody>{data.items.map((employee) => <tr key={employee.employeeId}><td><input type="checkbox" aria-label={`选择 ${employee.name}`} disabled={deleting} checked={checked.includes(employee.employeeId)} onChange={event => setChecked(current => event.target.checked ? [...current, employee.employeeId] : current.filter(id => id !== employee.employeeId))} /></td><td><strong>{employee.name}</strong><small className="table-subtitle">{employee.employeeId}</small></td><td>{employee.currentDepartment}</td><td>{employee.currentTitle}</td><td>{employee.email}</td><td><button className="text-button" type="button" disabled={!data.versionId} onClick={() => { if (data.versionId) setSelected({ employee, versionId: data.versionId }); }}>资料预览</button></td></tr>)}</tbody></table></div>
        <div className="library-pagination"><button className="text-button" disabled={deleting || page <= 1} onClick={() => changePage(page - 1)} type="button">上一页</button><span>第 {page} / {Math.max(1, Math.ceil(data.total / data.pageSize))} 页</span><button className="text-button" disabled={deleting || page * data.pageSize >= data.total} onClick={() => changePage(page + 1)} type="button">下一页</button></div>
      </> : <p className="empty-copy">{search ? "没有找到符合条件的员工。" : "尚无员工资料，请先导入员工数据。"}</p>}
      {selected ? <EmployeeProfileDrawer key={`${selected.versionId}:${selected.employee.employeeId}`} employee={selected.employee} versionId={selected.versionId} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}
