import type { CandidateProfile } from "../../resume-parser/domain/models";
import { possibleFunctionSearchFields } from "./possible-functions";

export function candidateSearchFields(profile: CandidateProfile): string[] {
  return [
    profile.candidateName,
    ...possibleFunctionSearchFields(profile.researchFunctions),
    ...profile.workExperiences.flatMap(work => [
      work.company.raw, work.company.value, work.rawTitle,
      work.normalizedFunction.raw, work.normalizedFunction.value,
    ]),
    ...profile.educations.flatMap(education => [
      education.school.raw, education.school.value, education.major.raw, education.major.value,
    ]),
  ].filter((value): value is string => value !== null);
}
