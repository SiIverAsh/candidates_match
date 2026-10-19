import { useState } from "react";
import type { EmployeeMatchResult, MatchConfidence, MatchEvidence } from "@/modules/matching/domain/models";
import { isGroupInitiallyOpen, type ResultGroup } from "../../domain/group-results";
import { describeEvidence, EVIDENCE_STRENGTH_LABELS } from "../evidence-details";

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
          {result.confidence === "HIGH" ? "高" : result.confidence === "MEDIUM" ? "中" : "低"} · {result.score} 分
        </span>
      </div>
      <div className="contact-row">
        <span>{result.email}</span>
        <button className="copy-button" onClick={() => void onCopy(result.email)} type="button">
          {copiedEmail === result.email ? "已复制" : "复制邮箱"}
        </button>
      </div>
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

