import { DATE_POINT_PATTERN, DATE_RANGE_PATTERN } from "../../resume-parser/domain/dates";

const NOISE = /^(?:职业档案中列出的|档案分析行|档案意向行|最新动态|\d+\s*次浏览|保存到项目|将.+保存到项目|发消息给|.+的更多操作|显示列表中的全部|已添加简历进行完善)/u;

// LinkedIn exports can serialize an entire experience list into one pipe-delimited cell.
export function normalizeEmployeeExperienceText(raw: string, kind: "work" | "education"): string {
  if (!/职业档案中列出的(?:工作|教育)经历/u.test(raw)) return raw;
  return raw.split(/\s*[|｜]\s*/u).map(item => item.trim()).filter(item => item && !NOISE.test(item)).map(item => {
    const range = item.match(new RegExp(DATE_RANGE_PATTERN, "iu"))?.[0];
    const dateTail = item.match(new RegExp(`\\s*·\\s*(${DATE_POINT_PATTERN})\\s*$`, "iu"));
    const dates = range ?? dateTail?.[1] ?? "";
    const content = (range ? item.replace(range, "") : dateTail ? item.slice(0, dateTail.index) : item).replace(/[\s·]+$/u, "").trim();
    if (kind === "education") {
      const parts = content.split(/，|,\s*(?=(?:Doctor|Bachelor|Master|Ph\.?D|B\.[AS]|M\.[AS]|MBA|MD)\b)/iu);
      return [`学校：${parts[0]}`, parts[1] && `学位：${parts.slice(1).join(", ")}`, dates && `就读时间：${dates}`].filter(Boolean).join("\n");
    }
    const at = content.match(/^(.+?)\s+(?:at|@)\s+(.+)$/iu);
    const dash = !at ? content.match(/^(.+?)\s+-\s+(.+)$/u) : null;
    if (!at && !dash) return item;
    return [`公司：${at ? at[2] : dash![1]}`, `职位：${at ? at[1] : dash![2]}`, dates && `任职时间：${dates}`].filter(Boolean).join("\n");
  }).join("\n\n");
}
