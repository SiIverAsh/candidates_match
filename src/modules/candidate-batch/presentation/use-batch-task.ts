import { useEffect, useRef, useState } from "react";
import type { BatchEvent, BatchItemResult } from "../domain/models";

export function useBatchTask() {
  const [items, setItems] = useState<BatchItemResult[]>([]);
  const [total, setTotal] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);
  async function run(operation: (onEvent: (event: BatchEvent) => void, signal: AbortSignal) => Promise<void>) {
    if (controller.current) return;
    const active = new AbortController();
    controller.current = active;
    setItems([]); setTotal(0); setError(""); setFinished(false); setRunning(true);
    const received: BatchItemResult[] = [];
    let count = 0;
    let complete = false;
    try {
      await operation((event) => {
        if (controller.current !== active) return;
        if (event.type === "start") { count = event.total; setTotal(event.total); }
        if (event.type === "item") { received.push(event.item); setItems((current) => [...current, event.item]); }
        if (event.type === "done") { complete = event.completed === count && received.length === count; setFinished(complete); }
      }, active.signal);
    } catch (failure) {
      complete = false;
      if (controller.current === active) setError(active.signal.aborted ? "已停止接收进度。正在处理的一条可能仍会保存，请先查看候选人库，再重试未完成项。" : failure instanceof Error ? failure.message : "批量处理失败，请检查候选人库后重试。");
    } finally {
      if (controller.current === active) { controller.current = null; setRunning(false); }
    }
    return { items: received, total: count, complete: complete && !active.signal.aborted };
  }
  function reset() {
    if (controller.current) return;
    setItems([]); setTotal(0); setError(""); setFinished(false);
  }
  return { items, total, running, error, finished, run, reset, stop: () => controller.current?.abort() };
}
