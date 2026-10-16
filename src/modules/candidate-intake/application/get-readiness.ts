import type { CandidateReadiness } from "../domain/models";
import type { EmployeeVersionReader } from "./ports";

export function getCandidateReadiness(reader: EmployeeVersionReader): CandidateReadiness {
  return reader.readiness();
}
