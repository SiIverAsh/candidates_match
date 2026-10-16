import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/client/api";
import type { EmployeeDirectoryPage, EmployeeRecord } from "../../domain/models";
import { EmployeeProfileDrawer } from "./employee-profile-drawer";

export function EmployeeDirectory() {
  const [data, setData] = useState<EmployeeDirectoryPage | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<{ employee: EmployeeRecord; versionId: string } | null>(null);
  useEffect(() => {
    let active = true;
    api.employees(page, search).then((value) => { if (active) { setData(value); setError(false); } })
      .catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search]);
  function searchEmployees(event: FormEvent) {
    event.preventDefault(); setLoading(true); setPage(1); setSearch(input.trim());
    if (page === 1 && search === input.trim()) setLoading(false);
  }
  function changePage(value: number) { setLoading(true); setPage(value); }
  return (
    <section className="history-panel" aria-labelledby="employee-directory-title">
      <div className="section-heading"><div><h2 id="employee-directory-title">员工资料库</h2><p>查看当前生效版本中的员工资料与完整履历。</p></div><span>共 {data?.total ?? 0} 位</span></div>
      <form className="library-search" onSubmit={searchEmployees}><label htmlFor="employee-search">搜索姓名、编号、邮箱、部门或职位</label><input id="employee-search" value={input} maxLength={100} onChange={(event) => setInput(event.target.value)} /><button className="primary-button" type="submit" disabled={loading}>搜索</button></form>
      {loading ? <p role="status">正在加载员工资料…</p> : error ? <p className="form-error" role="alert">员工列表加载失败，请刷新重试。</p> : data?.items.length ? <>
        <div className="table-scroll"><table className="data-table"><thead><tr><th>员工</th><th>部门</th><th>职位</th><th>邮箱</th><th>操作</th></tr></thead><tbody>{data.items.map((employee) => <tr key={employee.employeeId}><td><strong>{employee.name}</strong><small className="table-subtitle">{employee.employeeId}</small></td><td>{employee.currentDepartment}</td><td>{employee.currentTitle}</td><td>{employee.email}</td><td><button className="text-button" type="button" disabled={!data.versionId} onClick={() => { if (data.versionId) setSelected({ employee, versionId: data.versionId }); }}>资料预览</button></td></tr>)}</tbody></table></div>
        <div className="library-pagination"><button className="text-button" disabled={page <= 1} onClick={() => changePage(page - 1)} type="button">上一页</button><span>第 {page} / {Math.max(1, Math.ceil(data.total / data.pageSize))} 页</span><button className="text-button" disabled={page * data.pageSize >= data.total} onClick={() => changePage(page + 1)} type="button">下一页</button></div>
      </> : <p className="empty-copy">{search ? "没有找到符合条件的员工。" : "尚无员工资料，请先导入员工数据。"}</p>}
      {selected ? <EmployeeProfileDrawer key={`${selected.versionId}:${selected.employee.employeeId}`} employee={selected.employee} versionId={selected.versionId} onClose={() => setSelected(null)} /> : null}
    </section>
  );
}
