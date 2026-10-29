import { WorkspaceHeader } from "@/components/workspace-header";
import { useCallback, useEffect, useState } from "react";

import { api } from "@/client/api";
import type { AuthenticatedUser } from "@/modules/auth/domain/user";
import type { EmployeeDataOverview } from "../../domain/models";
import { EmployeeImportForm } from "../components/import-form";
import { EmployeeDirectory } from "../components/employee-directory";

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Shanghai",
  }).format(new Date(value));
}

const OUTCOME_LABELS: Record<string, string> = {
  PUBLISHED: "已发布",
  FILE_REJECTED: "文件被拒绝",
  VALIDATION_FAILED: "校验失败",
  PUBLISH_FAILED: "发布失败",
};

export function EmployeeDataPage({
  user,
  onLogout,
}: {
  user: AuthenticatedUser;
  onLogout: () => Promise<void>;
}) {
  const [overview, setOverview] = useState<EmployeeDataOverview | null>(null);
  const [loadError, setLoadError] = useState(false);
  const loadOverview = useCallback(async () => {
    try {
      setOverview(await api.employeeOverview());
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    let active = true;
    api.employeeOverview()
      .then((data) => {
        if (!active) return;
        setOverview(data);
        setLoadError(false);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!overview) {
    return (
      <main className="centered-page">
        <p>{loadError ? "员工数据加载失败，请刷新页面重试。" : "正在加载员工数据…"}</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <WorkspaceHeader user={user} onLogout={onLogout} />
      <div className="admin-layout">
        <aside className="admin-sidebar" aria-label="管理员导航">
          <a href="/candidates/new">← 返回人脉匹配</a>
          <div><p className="eyebrow">数据管理</p><strong>员工数据版本</strong></div>
          <p>只有最近一次成功发布的版本会进入后续匹配流程。</p>
        </aside>
        <div className="admin-main">
          <div className="workspace-heading admin-heading">
            <div>
              <p className="eyebrow">员工数据导入与版本</p>
              <h1>员工导入与管理</h1>
              <p>拖入一份或多份简历，或使用中文 Excel 名单批量导入；自动识别姓名、工作和教育经历。</p>
            </div>
            <span className="status-chip">服务端鉴权</span>
          </div>
          <section className="version-card" aria-labelledby="active-version-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">当前生效版本</p>
                <h2 id="active-version-title">{overview.activeVersion?.id ?? "尚无可用数据版本"}</h2>
              </div>
              <span className={`version-state ${overview.activeVersion?.employeeCount ? "is-active" : "is-empty"}`}>
                {overview.activeVersion?.employeeCount ? "已生效" : "暂不可匹配"}
              </span>
            </div>
            {overview.activeVersion ? (
              <dl className="version-metrics">
                <div><dt>员工</dt><dd>{overview.activeVersion.employeeCount}</dd></div>
                <div><dt>工作经历</dt><dd>{overview.activeVersion.workExperienceCount}</dd></div>
                <div><dt>教育经历</dt><dd>{overview.activeVersion.educationCount}</dd></div>
                <div><dt>导入人</dt><dd>{overview.activeVersion.importedBy}</dd></div>
                <div className="wide"><dt>生效时间</dt><dd>{formatDate(overview.activeVersion.importedAt)}</dd></div>
              </dl>
            ) : (
              <p className="empty-copy">完成首次成功导入后，系统才允许使用员工数据进行关系匹配。</p>
            )}
          </section>
          <EmployeeImportForm onImported={loadOverview} />
          <EmployeeDirectory key={overview.activeVersion?.id ?? "empty"} onChanged={loadOverview} totalEmployees={overview.activeVersion?.employeeCount ?? 0} overviewVersionId={overview.activeVersion?.id ?? null} />
          <section className="history-panel" aria-labelledby="history-title">
            <div className="section-heading"><div><p className="eyebrow">最近活动</p><h2 id="history-title">导入记录</h2></div></div>
            {overview.recentAttempts.length ? (
              <div className="table-scroll">
                <table className="data-table">
                  <thead><tr><th>时间</th><th>操作人</th><th>结果</th><th>问题数</th><th>版本</th></tr></thead>
                  <tbody>
                    {overview.recentAttempts.map((attempt) => (
                      <tr key={attempt.id}>
                        <td>{formatDate(attempt.attemptedAt)}</td>
                        <td>{attempt.attemptedBy}</td>
                        <td><span className={`attempt-status ${attempt.status.toLowerCase()}`}>
                          {OUTCOME_LABELS[attempt.outcomeCode] ?? attempt.outcomeCode}
                        </span></td>
                        <td>{attempt.issueCount}</td>
                        <td><code>{attempt.versionId ?? "—"}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="empty-copy">暂无导入记录。</p>}
          </section>
          <section className="schema-panel" aria-labelledby="schema-title">
            <div><p className="eyebrow">Excel 导入格式</p><h2 id="schema-title">支持中文员工名单，也兼容三表模板</h2></div>
            <p>中文名单在前 20 行提供“姓名”和“完整工作经历”“完整教育经历”“简历全文”等列，支持当前公司、当前职位、邮箱、领英链接和多段经历分列。总表与分表按人员来源去重；缺失邮箱、部门或日期保留为空。</p>
            <div className="schema-grid">
              <article><strong>Employees</strong><code>employee_id · name · email · current_department · current_title</code></article>
              <article><strong>WorkExperience</strong><code>employee_id · company · title · start_date · end_date</code></article>
              <article><strong>Education</strong><code>employee_id · school · major · start_date · end_date</code></article>
            </div>
            <p className="schema-note">上方为可选的原三表模板，继续沿用严格校验。中文名单和单份简历至少有一条可识别的工作或教育经历；日期保留原有年份、月份或日精度，未知结束时间不视为至今。</p>
          </section>
        </div>
      </div>
    </main>
  );
}
