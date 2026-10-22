import type { PossibleFunctionsSummary } from "../../domain/possible-functions";

const CONFIDENCE = { HIGH: "高", MEDIUM: "中", LOW: "低" } as const;
const STATUS = { CLASSIFIED: "", AMBIGUOUS: "方向接近 · 待复核", INSUFFICIENT: "证据不足", UNASSESSED: "暂时无法读取" } as const;

export function PossibleFunctionsCell({ summary, onOpen }: { summary: PossibleFunctionsSummary; onOpen: () => void }) {
  return <button className="possible-functions-button" type="button" aria-label="查看可能职能及判断依据" title={summary.message} onClick={event => { event.stopPropagation(); onOpen(); }}>
    {summary.functions.map(item => <span className="possible-function-option" key={item.functionId}>
      <strong>{item.rank}. {item.name}</strong>
      <small className={`function-confidence is-${item.confidence.toLowerCase()}`}>{CONFIDENCE[item.confidence]}置信度 · {item.score} 分{item.eligible ? "" : " · 未达归类条件"}</small>
    </span>)}
    {STATUS[summary.status] ? <span className="possible-functions-status">{STATUS[summary.status]}</span> : null}
    {summary.historical ? <small>依据历史经历，当前职能待确认</small> : null}
    <small className="possible-functions-link">查看依据 →</small>
  </button>;
}
