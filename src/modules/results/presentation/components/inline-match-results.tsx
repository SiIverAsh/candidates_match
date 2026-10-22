import { useState } from "react";
import { copyText } from "@/client/clipboard";
import type { MatchRun } from "@/modules/matching/domain/models";
import { groupMatchResults } from "../../domain/group-results";
import { ConfidenceGroup } from "./confidence-group";
import { ResearchFunctionSummary } from "@/modules/research-functions/presentation/research-function-summary";

export function InlineMatchResults({ run }: { run: MatchRun }) {
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);

  async function copyEmail(email: string) {
    try {
      await copyText(email);
      setCopiedEmail(email);
      setCopyError(false);
    } catch {
      setCopyError(true);
    }
  }

  if (run.status === "SKIPPED_INSUFFICIENT") {
    return <><ResearchFunctionSummary assessment={run.candidateFunctions} queryId={run.queryId} /><p className="parse-warning" role="status">简历中的有效经历不足，暂时无法匹配。请补充工作经历或教育经历后重新上传。</p></>;
  }

  return (
    <section aria-label="可能认识的员工">
      <ResearchFunctionSummary assessment={run.candidateFunctions} queryId={run.queryId} />
      <h2>{run.resultCount ? `找到 ${run.resultCount} 位可能认识的员工` : "暂未找到有共同经历的员工"}</h2>
      <p>按高、中、低置信度展示。共同经历仅表示可能认识，不代表双方确定认识。</p>
      {copyError ? <p className="form-error" role="alert">复制失败，请手动复制卡片中的邮箱。</p> : null}
      <div className="confidence-groups">
        {groupMatchResults(run).map((group) => (
          <ConfidenceGroup key={`${run.id}-${group.confidence}`} group={group} copiedEmail={copiedEmail} onCopy={copyEmail} initiallyOpen />
        ))}
      </div>
    </section>
  );
}
