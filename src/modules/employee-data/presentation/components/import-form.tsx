import { type FormEvent, useState } from "react";

import { api } from "@/client/api";
import { INITIAL_IMPORT_STATE, type ImportActionState } from "../contracts";

export function EmployeeImportForm({ onImported }: { onImported: () => Promise<void> }) {
  const [state, setState] = useState<ImportActionState>(INITIAL_IMPORT_STATE);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("employeeFile");
    if (!(file instanceof File)) return;
    setPending(true);
    try {
      const result = await api.importEmployees(file);
      setState(result);
      if (result.status === "success") await onImported();
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
    }
  }

  return (
    <div className="import-panel">
      <div className="section-heading">
        <div>
          <p className="eyebrow">上传新版本</p>
          <h2>批量导入员工履历</h2>
        </div>
        <a className="secondary-link" href="/api/admin/employee-data/template">
          下载标准模板
        </a>
      </div>
      <form className="import-form" onSubmit={submit}>
        <label className="file-drop" htmlFor="employeeFile">
          <strong>选择 Excel 文件</strong>
          <span>一份 .xlsx 可导入最多 10,000 位员工，最大 10 MB；全部校验通过后生效。</span>
          <input id="employeeFile" name="employeeFile" type="file" accept=".xlsx" required />
        </label>
        <button className="primary-button" disabled={pending} type="submit">
          {pending ? "正在校验并发布…" : "校验并发布新版本"}
        </button>
      </form>
      <p className="schema-note">请上传完整员工名单：成功发布后，新版本将整体替代当前匹配用的员工数据；未包含的员工不会进入后续匹配。旧版本保留供复核。</p>
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
