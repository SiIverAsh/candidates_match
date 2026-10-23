export const MATCHING_CONFIG = {
  ruleVersion: "matching-rules-v4",
  thresholdVersion: "confidence-v1",
  weights: {
    educationSchoolMajorOverlap: 70,
    educationSchoolOverlap: 35,
    educationSameSchool: 15,
    workFunctionSimilarityBonus: 20,
    workCompanyOverlap: 25,
    workSameCompany: 10,
  },
  thresholds: {
    high: 70,
    medium: 40,
    low: 10,
  },
} as const;

export function isCurrentMatchRun(run: { ruleVersion: string; thresholdVersion: string }): boolean {
  return run.ruleVersion === MATCHING_CONFIG.ruleVersion && run.thresholdVersion === MATCHING_CONFIG.thresholdVersion;
}
