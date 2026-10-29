import type { EmployeeResumeDraft } from "../domain/resume-import";
import type { EmployeeDataVersionSummary } from "../domain/models";

export interface ResumeFileBatchResult {
  imported: number;
  processed: number;
  total: number;
  failures: { name: string; message: string }[];
  version: EmployeeDataVersionSummary | null;
  interrupted: string | null;
}

type PendingResume = { name: string; draft: EmployeeResumeDraft };
type ImportResponse = { status: string; message: string; issues: { code: string; message: string }[]; version: EmployeeDataVersionSummary | null };

export async function importResumeFiles(
  files: File[],
  ports: {
    preview(file: File): Promise<{ kind: "parsed"; draft: EmployeeResumeDraft } | { kind: "rejected"; message: string }>;
    publish(drafts: EmployeeResumeDraft[]): Promise<ImportResponse>;
    progress(result: ResumeFileBatchResult): void;
  },
): Promise<ResumeFileBatchResult> {
  const result: ResumeFileBatchResult = { imported: 0, processed: 0, total: files.length, failures: [], version: null, interrupted: null };
  let pending: PendingResume[] = [];
  let pendingBytes = 0;
  const report = () => ports.progress({ ...result, failures: [...result.failures] });
  async function publish(batch: PendingResume[]): Promise<void> {
    const response = await ports.publish(batch.map(item => item.draft));
    if (response.status === "success") {
      result.imported += batch.length;
      result.processed += batch.length;
      result.version = response.version;
    } else if (response.issues.some(issue => issue.code === "PUBLISH_FAILED")) {
      throw new Error("发布失败，请检查服务后重试。");
    } else if (batch.length > 1) {
      const middle = Math.floor(batch.length / 2);
      await publish(batch.slice(0, middle));
      await publish(batch.slice(middle));
    } else {
      result.failures.push({ name: batch[0].name, message: response.issues.map(issue => issue.message).join("；") || response.message });
      result.processed++;
    }
    report();
  }
  async function flush() {
    if (pending.length) {
      const batch = pending;
      pending = [];
      pendingBytes = 0;
      await publish(batch);
    }
  }
  try {
    for (const file of files) {
      const name = file.webkitRelativePath || file.name;
      let parsed: Awaited<ReturnType<typeof ports.preview>>;
      try { parsed = await ports.preview(file); }
      catch { result.failures.push({ name, message: "读取失败，请检查文件后重试。" }); result.processed++; report(); continue; }
      if (parsed.kind === "rejected") { result.failures.push({ name, message: parsed.message }); result.processed++; report(); continue; }
      const bytes = new TextEncoder().encode(JSON.stringify(parsed.draft)).byteLength;
      if (pending.length && (pending.length >= 100 || pendingBytes + bytes > 6 * 1024 * 1024)) await flush();
      pending.push({ name, draft: parsed.draft });
      pendingBytes += bytes;
    }
    await flush();
  } catch {
    result.interrupted = "导入中断。部分请求的结果可能未收到，请刷新员工库核对后再重新导入剩余文件。";
  }
  report();
  return result;
}
