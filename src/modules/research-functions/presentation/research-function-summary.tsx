import type { ResearchFunctionAssessment } from "../domain/models";

const CONFIDENCE = { HIGH: "高", MEDIUM: "中", LOW: "低" } as const;
const STATUS = { CLASSIFIED: "已有优先职能", AMBIGUOUS: "方向接近 · 待复核", INSUFFICIENT: "证据不足" } as const;
const KIND = { STRONG: "强关键词", SUPPORTING: "辅助关键词", TITLE: "职位关键词", NEGATIVE: "排除关键词" } as const;

export function ResearchFunctionSummary({ assessment, queryId }: { assessment?: ResearchFunctionAssessment; queryId: string }) {
  if (!assessment) return (
    <section className="research-functions" aria-label="候选人职能判断">
      <h2>候选人职能优先级</h2>
      <p>简历职能信息暂时无法读取，请刷新页面重试，或打开<a href={`/candidates/${encodeURIComponent(queryId)}`}>候选人详情</a>检查简历正文。</p>
    </section>
  );
  const source = assessment.source;
  return (
    <section className="research-functions" aria-label="候选人职能判断">
      <header className="research-functions-heading">
        <h2>候选人职能优先级</h2>
        <span className={`function-confidence is-${assessment.confidence.toLowerCase()}`}>{STATUS[assessment.status]} · {CONFIDENCE[assessment.confidence]}置信度</span>
      </header>
      <p>{assessment.summary}</p>
      <p className="research-functions-scope">范围：药物发现阶段的 Research。置信度表示规则证据强弱，分数不是准确率，也不代表与内部员工的关系强度。</p>
      {source ? <p className="research-functions-source">依据第 {source.sequence + 1} 段工作：{source.company ?? "单位未识别"} · {source.title ?? "职位未识别"} · {source.start ?? "开始时间未知"}—{source.current ? "至今" : source.end ?? "结束时间未知"}{assessment.historical ? "（历史经历）" : ""}</p> : null}
      <ol className="research-function-priorities">
        {assessment.priorities.map(item => (
          <li key={item.functionId}>
            <details open={item.rank === 1}>
              <summary>
                <span className="function-rank">{item.rank}</span>
                <strong>{item.name}</strong>
                <span>{item.score} 分</span>
                <span className={`function-confidence is-${item.confidence.toLowerCase()}`}>{CONFIDENCE[item.confidence]}置信度{!item.eligible ? " · 未达归类条件" : ""}</span>
              </summary>
              <ul className="function-reasons">{item.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
              <ul className="function-evidence">
                {item.evidence.map(evidence => (
                  <li key={`${evidence.kind}:${evidence.keyword}`}>
                    <div><strong>{evidence.keyword}</strong><span>{KIND[evidence.kind]} · {evidence.points > 0 ? "+" : ""}{evidence.points} 分</span></div>
                    <blockquote>{evidence.excerpt}</blockquote>
                    <small>{evidence.sourceField === "title" ? "职位原文" : "工作内容原文"} · {evidence.explanation}</small>
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ol>
    </section>
  );
}
