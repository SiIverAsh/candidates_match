import type { CandidateResearchExperience } from "./models";
import { cleanResumeLine, EXPERIENCE_DESCRIPTION, isResumeSection, RESEARCH_SECTION } from "./resume-sections";

// Match only complete, unambiguously research-oriented section headings.
// Mixed headings such as 工作与科研经历 and Research & Work Experience stay
// with the existing experience parser rather than being moved wholesale.
export function extractResearchSections(text: string): { remainingText: string; researchExperiences: CandidateResearchExperience[] } {
  const remaining: string[] = [];
  const researchExperiences: CandidateResearchExperience[] = [];
  let heading: string | null = null;
  let description: string[] = [];
  const flush = () => {
    if (heading !== null && description.some(line => line.trim())) {
      researchExperiences.push({ sequence: researchExperiences.length, heading, description: description.join("\n").trim() });
    }
    heading = null;
    description = [];
  };
  for (const originalLine of text.split(/\r?\n/u)) {
    const line = cleanResumeLine(originalLine);
    if (RESEARCH_SECTION.test(line)) {
      flush();
      heading = line.replace(/\s*[:：]\s*$/u, "");
      // Keep a boundary in the ordinary parser so surrounding sections cannot
      // accidentally flow into each other when the research body is removed.
      remaining.push(originalLine);
      continue;
    }
    // A bullet like "Publication: paper title" belongs to a research entry;
    // only a heading without following inline prose ends the section.
    const strongInlineBoundary = /^(?:research\s+(?:skills|interests?)|研究技能|研究兴趣|skills|工作经历|教育经历)\s*[:：]\s*\S/iu.test(line);
    if (heading !== null && line && (strongInlineBoundary || !/[:：]\s*\S/u.test(line)) && isResumeSection(line) && !EXPERIENCE_DESCRIPTION.test(line)) flush();
    if (heading !== null) description.push(originalLine);
    else remaining.push(originalLine);
  }
  flush();
  return { remainingText: remaining.join("\n"), researchExperiences };
}
