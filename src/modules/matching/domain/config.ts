export const MATCHING_CONFIG = {
  ruleVersion: "matching-rules-v1",
  thresholdVersion: "confidence-v1",
  weights: {
    educationSchoolMajorOverlap: 70,
    educationSchoolOverlap: 35,
    educationSameSchool: 15,
    workCompanyFunctionOverlap: 45,
    workCompanyOverlap: 25,
    workSameCompany: 10,
  },
  thresholds: {
    high: 70,
    medium: 40,
    low: 10,
  },
} as const;
