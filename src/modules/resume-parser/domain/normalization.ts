import type { NormalizedValue } from "./models";

export const NORMALIZER_VERSION = "entity-rules-v1";

const COMPANY_ALIASES: Record<string, string> = {
  ibm: "IBM",
  microsoft: "Microsoft",
  微软: "Microsoft",
  google: "Google",
  谷歌: "Google",
  bytedance: "字节跳动",
  字节跳动: "字节跳动",
  tencent: "腾讯",
  腾讯: "腾讯",
  alibaba: "阿里巴巴",
  阿里巴巴: "阿里巴巴",
};

const SCHOOL_ALIASES: Record<string, string> = {
  pekinguniversity: "北京大学",
  北京大学: "北京大学",
  tsinghuauniversity: "清华大学",
  清华大学: "清华大学",
  renminuniversityofchina: "中国人民大学",
  中国人民大学: "中国人民大学",
};

const MAJOR_ALIASES: Record<string, string> = {
  computerscience: "计算机科学",
  计算机科学与技术: "计算机科学",
  计算机科学: "计算机科学",
  businessadministration: "工商管理",
  工商管理: "工商管理",
  marketing: "市场营销",
  市场营销: "市场营销",
};

const FUNCTIONS: Array<{ value: string; terms: RegExp }> = [
  { value: "产品", terms: /产品|product/iu },
  { value: "工程与技术", terms: /工程|开发|软件|算法|数据|技术|engineer|developer|software|data scientist/iu },
  { value: "销售", terms: /销售|客户经理|商务拓展|sales|account executive|business development/iu },
  { value: "市场", terms: /市场|品牌|增长|marketing|brand|growth/iu },
  { value: "人力资源", terms: /人力|招聘|人才|hr|recruit|talent/iu },
  { value: "财务", terms: /财务|会计|审计|finance|accounting|audit/iu },
  { value: "医学与临床", terms: /医学|临床|医药|medical|clinical|pharma/iu },
  { value: "运营", terms: /运营|供应链|采购|operations|supply chain|procurement/iu },
  { value: "法务", terms: /法务|合规|律师|legal|compliance|counsel/iu },
  { value: "咨询", terms: /咨询|顾问|consult/iu },
  { value: "研究", terms: /研究|科研|scientist|research/iu },
];

function cleaned(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ");
}

function aliasKey(value: string): string {
  return cleaned(value).toLowerCase().replace(/[\s.,，。·'’"“”()（）_-]/g, "");
}

function unresolved(raw: string | null): NormalizedValue {
  return { raw, value: null, alternatives: [], confidence: "LOW", method: "UNRESOLVED" };
}

export function normalizeCompany(raw: string | null): NormalizedValue {
  if (!raw) return unresolved(raw);
  const source = cleaned(raw);
  const withoutSuffix = source
    .replace(/(?:有限责任公司|股份有限公司|有限公司)$/u, "")
    .replace(/\b(?:incorporated|inc|limited|ltd|llc|corp(?:oration)?|company|co)\.?$/iu, "")
    .trim();
  const key = aliasKey(withoutSuffix);
  const alias = COMPANY_ALIASES[key];
  if (alias) return { raw: source, value: alias, alternatives: [alias], confidence: "HIGH", method: "ALIAS" };
  const value = withoutSuffix;
  return { raw: source, value: value || source, alternatives: [value || source], confidence: "MEDIUM", method: "RULE" };
}

export function normalizeSchool(raw: string | null): NormalizedValue {
  if (!raw) return unresolved(raw);
  const source = cleaned(raw);
  const alias = SCHOOL_ALIASES[aliasKey(source)];
  if (alias) return { raw: source, value: alias, alternatives: [alias], confidence: "HIGH", method: "ALIAS" };
  return { raw: source, value: source, alternatives: [source], confidence: "MEDIUM", method: "RULE" };
}

export function normalizeMajor(raw: string | null): NormalizedValue {
  if (!raw) return unresolved(raw);
  const source = cleaned(raw);
  const alias = MAJOR_ALIASES[aliasKey(source)];
  if (alias) return { raw: source, value: alias, alternatives: [alias], confidence: "HIGH", method: "ALIAS" };
  return { raw: source, value: source, alternatives: [source], confidence: "MEDIUM", method: "RULE" };
}

export function normalizeFunction(rawTitle: string | null): NormalizedValue {
  if (!rawTitle) return unresolved(rawTitle);
  const source = cleaned(rawTitle);
  const matches = FUNCTIONS.filter((item) => item.terms.test(source)).map((item) => item.value);
  if (matches.length === 0) return { raw: source, value: null, alternatives: [], confidence: "LOW", method: "UNRESOLVED" };
  return {
    raw: source,
    value: matches[0],
    alternatives: matches,
    confidence: matches.length === 1 ? "HIGH" : "LOW",
    method: "KEYWORD",
  };
}
