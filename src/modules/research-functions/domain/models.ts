export type FunctionConfidence = "HIGH" | "MEDIUM" | "LOW";
export interface ResearchTaxonomy {
  version: string;
  scope: string;
  scoring: { strong_keyword: number; supporting_keyword: number; title_keyword: number; negative_keyword: number; assign_threshold: number; ambiguous_gap: number };
  functions: Array<{
    id: string; name: string; strong_keywords: string[]; supporting_keywords: string[]; title_keywords: string[];
  }>;
  exclusion_keywords: { keywords: string[] };
}

export interface ResearchWorkSource {
  sequence: number;
  company: string | null;
  title: string | null;
  description: string;
  start: string | null;
  end: string | null;
  current: boolean;
}

export interface FunctionEvidence {
  keyword: string;
  kind: "STRONG" | "SUPPORTING" | "TITLE" | "NEGATIVE";
  sourceField: "title" | "description";
  excerpt: string;
  points: number;
  explanation: string;
}

export interface FunctionPriority {
  rank: number;
  functionId: string;
  name: string;
  score: number;
  confidence: FunctionConfidence;
  eligible: boolean;
  reasons: string[];
  evidence: FunctionEvidence[];
}

export interface ResearchFunctionAssessment {
  taxonomyVersion: string;
  ruleVersion: string;
  scope: string;
  status: "CLASSIFIED" | "AMBIGUOUS" | "INSUFFICIENT";
  confidence: FunctionConfidence;
  primaryFunctionId: string | null;
  source: Omit<ResearchWorkSource, "description"> | null;
  historical: boolean;
  summary: string;
  priorities: FunctionPriority[];
}
