import { useEffect, useRef, useState } from "react";
import { api, type CandidateSubmissionResult } from "@/client/api";

export function useSingleResume() {
  const [result, setResult] = useState<CandidateSubmissionResult | null>(null);
  const [phase, setPhase] = useState<"parsing" | "matching" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  async function match(accepted: Extract<CandidateSubmissionResult, { kind: "accepted" }>) {
    if (accepted.parsing.kind !== "profile" || !mounted.current) return;
    setPhase("matching");
    try {
      const matching = await api.runMatching(accepted.query.id);
      if (mounted.current) setResult({ ...accepted, matching });
    } catch {
      if (mounted.current) setResult({
        ...accepted,
        matching: { kind: "persistence_failed", message: "匹配请求失败，可重试匹配，无需重新上传简历。" },
      });
    }
  }

  async function execute(action: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      await action();
    } catch {
      if (mounted.current) setError("请求失败，请检查网络后重试；已保存的简历可在候选人库中查看。");
    } finally {
      busy.current = false;
      if (mounted.current) setPhase(null);
    }
  }

  function submit(input: { file: File | null; text: string | null }) {
    return execute(async () => {
      setResult(null);
      setPhase("parsing");
      const submitted = await api.submitCandidate(input);
      if (!mounted.current) return;
      setResult(submitted);
      if (submitted.kind === "accepted") await match(submitted);
    });
  }

  function retryParsing() {
    if (result?.kind !== "accepted") return;
    return execute(async () => {
      setPhase("parsing");
      const parsing = await api.parseCandidate(result.query.id);
      if (!mounted.current) return;
      const updated = { ...result, parsing, matching: null };
      setResult(updated);
      await match(updated);
    });
  }

  function retryMatching() {
    if (result?.kind !== "accepted") return;
    return execute(() => match(result));
  }

  return { result, phase, error, submit, retryParsing, retryMatching };
}
