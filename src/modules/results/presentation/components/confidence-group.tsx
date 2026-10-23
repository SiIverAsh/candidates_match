import { useState } from "react";
import type { EmployeeMatchResult, MatchConfidence, MatchEvidence } from "@/modules/matching/domain/models";
import { isGroupInitiallyOpen, type ResultGroup } from "../../domain/group-results";
import { describeEvidence, EVIDENCE_STRENGTH_LABELS } from "../evidence-details";

const FUNCTION_SIMILARITY_LABELS = { SAME_CATEGORY: "存在大类相同的职位", DIFFERENT_CATEGORY: "已识别的职位大类不同", UNKNOWN: "信息不足" } as const;

function confidenceClass(confidence: MatchConfidence): string {
  return confidence === "HIGH" ? "high" : confidence === "MEDIUM" ? "medium" : "low";
}

function EvidenceItem({ evidence }: { evidence: MatchEvidence }) {
  const details = describeEvidence(evidence);
  return (
    <li className="evidence-item">
      <div>
        <span className={`evidence-strength ${evidence.strength.toLowerCase()}`}>{EVIDENCE_STRENGTH_LABELS[evidence.strength]}</span>
        <strong>{evidence.reason}</strong>
      </div>
      <details>
        <summary>查看依据详情</summary>
        <dl>
          {details.facts.map((fact, index) => <div key={index}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}
          <div><dt>{details.periodLabel}</dt><dd>{details.period}{details.precision ? <small className="evidence-date-note">{details.precision}</small> : null}</dd></div>
          <div><dt>候选人资料出处</dt>{details.candidateSources.map((source) => <dd key={source}>{source}</dd>)}</div>
          <div><dt>员工资料出处</dt>{details.employeeSources.map((source) => <dd key={source}>{source}</dd>)}</div>
        </dl>
      </details>
    </li>
  );
}

function ResultCard({
  result,
  copiedEmail,
  onCopy,
}: {
  result: EmployeeMatchResult;
  copiedEmail: string | null;
  onCopy: (email: string) => Promise<void>;
}) {
  return (
    <article className="result-card" aria-labelledby={`employee-${result.employeeId}`}>
      <div className="result-card-heading">
        <span className="rank-number">#{result.rank}</span>
        <div>
          <h3 id={`employee-${result.employeeId}`}>{result.name}</h3>
          <p>{result.currentDepartment} · {result.currentTitle}</p>
        </div>
        <span className={`confidence-badge ${confidenceClass(result.confidence)}`}>
          关系置信度{result.confidence === "HIGH" ? "高" : result.confidence === "MEDIUM" ? "中" : "低"} · {result.score} 分
        </span>
      </div>
      <div className="contact-row">
        <span>{result.email || "未提供邮箱"}</span>
        <button className="copy-button" disabled={!result.email} onClick={() => void onCopy(result.email)} type="button">
          {copiedEmail === result.email ? "已复制" : "复制邮箱"}
        </button>
      </div>
      {result.functionSimilarity ? <div className="evidence-block">
        <strong>职能相似度 · {FUNCTION_SIMILARITY_LABELS[result.functionSimilarity.status]}</strong>
        <p>经历证据 {result.relationshipScore} 分 ＋ 职能辅助加分 {result.functionSimilarity.bonus} 分；总分上限 100 分。</p>
        <p>比较共同公司经历中的职位大类，不能单独据此推断双方认识。</p>
        {result.functionSimilarity.comparisons.length ? <details>
          <summary>查看职能比较依据</summary>
          <ul>{result.functionSimilarity.comparisons.map((item, index) => <li key={index}>
            <strong>{item.company}</strong>：候选人「{item.candidateTitle ?? "职位缺失"}」（{item.candidateFunction ?? "未识别"}）与员工「{item.employeeTitle}」（{item.employeeFunction ?? "未识别"}）。
            {item.reason} 辅助加分 {item.bonus} 分。
          </li>)}</ul>
        </details> : null}
      </div> : null}
      <div className="evidence-block">
        <strong>推荐依据 · {result.evidence.length}</strong>
        <ul>{result.evidence.map((evidence) => <EvidenceItem evidence={evidence} key={evidence.id} />)}</ul>
      </div>
    </article>
  );
}

export function ConfidenceGroup({
  group,
  copiedEmail,
  onCopy,
  initiallyOpen,
}: {
  group: ResultGroup;
  copiedEmail: string | null;
  onCopy: (email: string) => Promise<void>;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen ?? isGroupInitiallyOpen(group.confidence));
  return (
    <details
      className={`confidence-group ${confidenceClass(group.confidence)}`}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      open={open}
    >
      <summary>
        <span>{group.label}</span>
        <strong>{group.results.length}</strong>
      </summary>
      <div className="result-list">
        {group.results.length ? group.results.map((result) => (
          <ResultCard copiedEmail={copiedEmail} key={result.employeeId} onCopy={onCopy} result={result} />
        )) : <p className="empty-copy">该置信度暂无结果。</p>}
      </div>
    </details>
  );
}

