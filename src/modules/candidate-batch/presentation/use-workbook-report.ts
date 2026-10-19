import { useEffect, useRef, useState } from "react";
import type { BatchReport } from "../domain/report";

export function useWorkbookReport() {
  const [report, setReport] = useState<BatchReport | null>(null);
  const [file, setFile] = useState<{ url: string; name: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const busy = useRef(false);
  const url = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);

  function reset() {
    generation.current++;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
    setFile(null); setReport(null); setError("");
  }

  async function create(input = report) {
    if (!input || busy.current || !mounted.current) return;
    busy.current = true;
    const active = ++generation.current;
    setReport(input); setPending(true); setError("");
    try {
      const { batchReportApplication } = await import("../browser-composition");
      const bytes = await batchReportApplication.export(input);
      if (!mounted.current || active !== generation.current) return;
      if (url.current) URL.revokeObjectURL(url.current);
      url.current = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const name = `${input.sourceName.replace(/\.xlsx$/iu, "")}_${input.items.length === input.total ? "匹配结果" : "部分匹配结果"}.xlsx`;
      setFile({ url: url.current, name });
      const link = document.createElement("a");
      link.href = url.current;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
    } catch (failure) {
      if (mounted.current && active === generation.current) setError(failure instanceof Error ? failure.message : "结果文件生成失败，请重试导出，无需重新导入。");
    } finally {
      busy.current = false;
      if (mounted.current && active === generation.current) setPending(false);
    }
  }

  return { report, file, pending, error, reset, remember: setReport, create };
}
