import { useState } from "react";
import { ClipboardCheck } from "lucide-react";
import { api, ApiError, type CandidateDetail } from "@/client/api";
import { REVIEW_REASON_LABELS } from "../../domain/manual-review";

export function CandidateReviewPanel({ detail, onChange, disabled = false }: {
  detail: CandidateDetail;
  onChange(detail: CandidateDetail): void;
  disabled?: boolean;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { review } = detail;
  if (review.status === "NONE") return null;

  async function updateReview() {
    if (!review.runId) return;
    setSaving(true); setError(null);
    try {
      const result = await api.reviewCandidate(detail.query.id, review.runId, review.status === "REVIEWED" ? "PENDING" : "REVIEWED");
      onChange({ ...detail, review: result.review });
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        setError("匹配结果已变化，正在刷新资料，请核对后重新操作。");
        try { onChange(await api.candidateDetail(detail.query.id)); }
        catch { setError("资料刷新失败，请重新打开候选人后复核。"); }
      } else setError("复核状态保存失败，请重试。");
    } finally { setSaving(false); }
  }

  return <section className={`candidate-review-panel is-${review.status.toLowerCase()}`} aria-label="人工复核">
    <div className="review-panel-heading"><strong><ClipboardCheck size={16} />{review.status === "REVIEWED" ? "已人工复核" : "待人工复核"}</strong><button type="button" className={review.status === "REVIEWED" ? "text-button" : "primary-button"} disabled={saving || disabled} onClick={() => void updateReview()}>{saving ? "正在保存…" : review.status === "REVIEWED" ? "重新加入待复核" : "标记已复核"}</button></div>
    <p>{review.reason ? REVIEW_REASON_LABELS[review.reason] : ""}。请核对工作与教育经历，必要时重新解析后匹配。</p>
    {review.decision ? <small>{review.decision.reviewedByName} · {new Date(review.decision.reviewedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false })}</small> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
  </section>;
}
