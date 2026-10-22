import type { BatchItemResult, BatchItemStatus } from "./models";

export const BATCH_STATUS_LABELS: Record<BatchItemStatus, string> = {
  IMPORTED: "已导入，未匹配", MATCHED: "匹配完成", NO_RESULTS: "暂无匹配",
  NEEDS_DATA: "等待员工数据", NEEDS_INPUT: "需补充资料", FAILED: "处理失败",
};
export interface BatchReport {
  sourceName: string;
  total: number;
  items: BatchItemResult[];
}

export function prepareBatchReport(report: BatchReport): BatchReport {
  if (!report.items.length || report.total < report.items.length) {
    throw new Error("没有可导出的结果，或批次记录不完整。");
  }
  const indexes = new Set<number>();
  for (const item of report.items) {
    if ((!item.workbookRow && !item.sourceFileName) || !Number.isInteger(item.index) || item.index < 0 || item.index >= report.total || indexes.has(item.index)) {
      throw new Error("缺少原始 Excel 行信息或简历文件来源，请重新选择资料处理新的批次。");
    }
    if (item.status === "MATCHED" && (!item.employeeContacts || item.employeeContacts.length !== item.resultCount)) {
      throw new Error("员工匹配明细不完整，无法导出。请重启服务并刷新页面；已导入的候选人仍保留在简历库。");
    }
    indexes.add(item.index);
  }
  return { ...report, items: [...report.items].sort((a, b) => a.index - b.index) };
}
