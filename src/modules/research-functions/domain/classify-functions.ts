import type { FunctionEvidence, FunctionPriority, ResearchFunctionAssessment, ResearchTaxonomy, ResearchWorkSource } from "./models";

export const RESEARCH_FUNCTION_RULE_VERSION = "research-functions-v1";

// Equivalent names contribute once per function and work experience.
const SYNONYMS = [
  ["Target Identification", "Target ID"], ["Mechanism of Action", "MoA"],
  ["Cell-based Assay", "Cell Based Assays"], ["Co-IP", "Immunoprecipitation"],
  ["CRISPR", "CRISPR/Cas9"], ["Flow Cytometry", "Multi-color Flow Cytometry", "Spectral Flow Cytometry", "FACS"],
  ["High-Throughput Screening", "HTS"], ["Crystallography", "X-ray Crystallography"],
  ["SPR", "Surface Plasmon Resonance", "Biacore"], ["BLI", "Octet"],
  ["ITC", "Isothermal Titration Calorimetry"], ["Structure-Based Drug Design", "SBDD"],
  ["Structure-Activity Relationship", "SAR"], ["DNA-encoded Library", "DEL"],
  ["Fragment-Based Drug Discovery", "FBDD"], ["T Cell Engager", "TCE"],
  ["Monoclonal Antibody", "mAb"], ["Bispecific Antibody", "Bispecific"],
  ["ADC Discovery", "ADC", "Antibody-Drug Conjugate"], ["Tumor Growth Inhibition", "TGI"],
  ["AI Drug Discovery", "AIDD"],
];
const GENERIC_TITLES = new Set(["research scientist", "principal scientist", "senior scientist", "research investigator", "group leader", "biologist"]);
const DISCOVERY_CONTEXT = ["Drug Discovery", "Target Identification", "Target Discovery", "Target Validation", "Target ID", "Target Biology", "Target Prioritization", "In Silico Target Discovery", "AI Drug Discovery", "AIDD", "Computational Drug Discovery"];
const DISEASE_TERMS = new Set(["Disease Biology", "Cancer Biology", "Tumor Biology", "Tumor Immunology", "Immuno-Oncology", "Tumor Microenvironment", "T Cell Biology", "B Cell Biology", "Myeloid Biology", "Innate Immunity", "Adaptive Immunity", "Immunobiology", "Synthetic Lethality", "DNA Damage Response"]);

function normalized(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function concept(keyword: string): string {
  return normalized(SYNONYMS.find(group => group.some(term => normalized(term) === normalized(keyword)))?.[0] ?? keyword);
}

function contains(text: string, keyword: string): boolean {
  return ` ${normalized(text)} `.includes(` ${normalized(keyword)} `);
}

interface Snippet { field: "title" | "description"; text: string }
function snippets(work: ResearchWorkSource): Snippet[] {
  return [
    ...(work.title ? [{ field: "title" as const, text: work.title }] : []),
    // Keep wrapped PDF lines together so a phrase can span a visual line break.
    ...work.description.split(/[;；]|(?<=[.!?。])\s+|\n(?=\s*(?:\d+[.)]\s|[-•]\s))/u).map(text => text.trim()).filter(Boolean)
      .map(text => ({ field: "description" as const, text })),
  ];
}

function contextWarning(snippet: Snippet): string | null {
  if (/\b(?:no (?:experience|expertise|background)(?:\s+\w+){0,2}|not (?:experienced|involved)|without (?:experience|expertise)|never (?:worked|performed))\b|无相关经验|未从事|不负责/iu.test(snippet.text)) return "否定语境，未计分";
  if (/\b(?:collaborat(?:ed|ion|ing)|partner(?:ed|ing)|in collaboration|with (?:the )?.*team)\b|协作|合作|配合/iu.test(snippet.text)) return "涉及合作方，无法确认本人承担的职能，未计分";
  return null;
}

function hit(items: Snippet[], keyword: string): Snippet | undefined {
  const matches = items.filter(item => contains(item.text, keyword));
  return matches.find(item => !contextWarning(item)) ?? matches[0];
}

function scoreWork(work: ResearchWorkSource, taxonomy: ResearchTaxonomy): FunctionPriority[] {
  const items = snippets(work);
  const activeItems = items.filter(item => !contextWarning(item));
  const any = (keywords: string[]) => keywords.some(keyword => activeItems.some(item => contains(item.text, keyword)));
  const discoveryContext = any(DISCOVERY_CONTEXT);
  return taxonomy.functions.map(fn => {
    const evidence = new Map<string, FunctionEvidence>();
    const add = (keywords: string[], kind: FunctionEvidence["kind"], weight: number) => {
      // A title is one signal; nested generic titles must not inflate its score.
      const selectedKeywords = kind === "TITLE"
        ? keywords.filter(keyword => hit(items.filter(item => item.field === "title"), keyword))
          .sort((a, b) => b.length - a.length).slice(0, 1)
        : keywords;
      for (const keyword of selectedKeywords) {
        const found = hit(kind === "TITLE" ? items.filter(item => item.field === "title") : items, keyword);
        if (!found) continue;
        let warning = contextWarning(found);
        if (!warning && fn.id === "discovery_biology" && DISEASE_TERMS.has(keyword) && !discoveryContext) warning = "缺少同段 Drug Discovery / Target 证据，未计分";
        if (!warning && fn.id === "molecular_science" && keyword === "Protein Purification" && !any(["Structural Biology", "Biophysics", "Drug Discovery"])) warning = "蛋白纯化缺少同段结构生物学、生物物理或药物发现证据，未计分";
        if (!warning && fn.id === "medicinal_chemistry" && ["Organic Synthesis", "Synthetic Organic Chemistry"].includes(keyword) && !any(["Drug Discovery", "SAR", "Structure-Activity Relationship", "Lead Optimization"])) warning = "有机合成缺少同段药物发现、SAR 或先导优化证据，未计分";
        const item: FunctionEvidence = { keyword, kind, sourceField: found.field, excerpt: found.text, points: warning ? 0 : weight, explanation: warning ?? (kind === "NEGATIVE" ? "非 Research 范围的排除信号" : "同一经历内命中；重复词与同义词只计一次") };
        const key = `${kind === "NEGATIVE" ? "negative:" : ""}${concept(keyword)}`;
        const previous = evidence.get(key);
        if (!previous || Math.abs(item.points) > Math.abs(previous.points) || (item.points === previous.points && kind === "TITLE")) evidence.set(key, item);
      }
    };
    add(fn.strong_keywords, "STRONG", taxonomy.scoring.strong_keyword);
    add(fn.title_keywords, "TITLE", taxonomy.scoring.title_keyword);
    add(fn.supporting_keywords, "SUPPORTING", taxonomy.scoring.supporting_keyword);
    add(taxonomy.exclusion_keywords.keywords, "NEGATIVE", taxonomy.scoring.negative_keyword);
    const entries = [...evidence.values()];
    const score = entries.reduce((total, item) => total + item.points, 0);
    const hasAnchor = entries.some(item => item.points > 0 && (item.kind === "STRONG" || (item.kind === "TITLE" && !GENERIC_TITLES.has(normalized(item.keyword)))));
    const reasons: string[] = [];
    if (score < taxonomy.scoring.assign_threshold) reasons.push(`得分 ${score}，未达到 ${taxonomy.scoring.assign_threshold} 分归类门槛`);
    if (!hasAnchor) reasons.push("缺少明确职能强词或专属职位，通用职位与实验技能不足以归类");
    if (fn.id === "computational_discovery") {
      if (!discoveryContext) reasons.push("计算生物学缺少同段药物发现或靶点证据");
      if (any(["Biomarker", "Clinical Samples"])) reasons.push("同段出现 Biomarker / Clinical Samples，按词库规则不归入 Research 计算职能");
    }
    const eligible = reasons.length === 0;
    if (eligible) reasons.push(`达到 ${taxonomy.scoring.assign_threshold} 分门槛，且存在明确职能证据`);
    if (entries.some(item => item.points < 0)) reasons.push("存在排除信号，已扣分并限制置信度");
    return { rank: 0, functionId: fn.id, name: fn.name, score, confidence: "LOW" as const, eligible, reasons, evidence: entries };
  }).filter(item => item.evidence.some(evidence => evidence.kind !== "NEGATIVE"))
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || b.score - a.score || a.functionId.localeCompare(b.functionId))
    .map((item, index) => ({ ...item, rank: index + 1 }));
}

export function classifyResearchFunctions(work: ResearchWorkSource[], taxonomy: ResearchTaxonomy): ResearchFunctionAssessment {
  const ordered = [...work].sort((a, b) => Number(b.current) - Number(a.current) ||
    (b.end ?? b.start ?? "").localeCompare(a.end ?? a.start ?? "") ||
    (b.start ?? "").localeCompare(a.start ?? "") || a.sequence - b.sequence);
  const evaluated = ordered.map(source => ({ source, priorities: scoreWork(source, taxonomy) }));
  const selected = evaluated.find(item => item.priorities.some(priority => priority.eligible)) ?? evaluated[0];
  const historical = Boolean(selected && selected !== evaluated[0]);
  const priorities: FunctionPriority[] = selected?.priorities ?? [];
  const top = priorities[0];
  const runner = priorities[1];
  const ambiguous = Boolean(top?.eligible && runner?.eligible && top.score - runner.score <= taxonomy.scoring.ambiguous_gap);
  const status = !top?.eligible ? "INSUFFICIENT" : ambiguous ? "AMBIGUOUS" : "CLASSIFIED";
  const datesKnown = Boolean(selected?.source.start && (selected.source.current || selected.source.end));
  for (const item of priorities) {
    const anchors = item.evidence.filter(e => e.points > 0 && (e.kind === "STRONG" || (e.kind === "TITLE" && !GENERIC_TITLES.has(normalized(e.keyword))))).length;
    item.confidence = !item.eligible || ambiguous ? "LOW"
      : item.score >= taxonomy.scoring.assign_threshold * 2 && anchors >= 2 && !historical && datesKnown && !item.evidence.some(e => e.points < 0) ? "HIGH" : "MEDIUM";
    if (ambiguous && item.rank <= 2) item.reasons.push(`前两项分差不超过 ${taxonomy.scoring.ambiguous_gap}，需人工复核`);
    if (historical) item.reasons.push("最近经历证据不足，本次依据较早经历；不能直接视为当前职能");
    if (!datesKnown) item.reasons.push("经历日期不完整，置信度最高为中");
  }
  const source = selected ? {
    sequence: selected.source.sequence, company: selected.source.company, title: selected.source.title,
    start: selected.source.start, end: selected.source.end, current: selected.source.current,
  } : null;
  const summary = status === "CLASSIFIED" ? `优先职能：${top.name}。${historical ? "依据较早工作经历，当前职能待确认。" : "依据最近一段有充分证据的工作经历。"}`
    : status === "AMBIGUOUS" ? "前两项职能得分接近，保留优先级供人工复核，暂不确定主要职能。"
    : "现有工作经历不足以确定药物发现阶段的 Research 职能；不代表候选人没有其他职能。";
  return {
    taxonomyVersion: taxonomy.version, ruleVersion: RESEARCH_FUNCTION_RULE_VERSION, scope: taxonomy.scope,
    status, confidence: status === "CLASSIFIED" ? top.confidence : "LOW",
    primaryFunctionId: status === "CLASSIFIED" ? top.functionId : null,
    source, historical, summary, priorities,
  };
}
