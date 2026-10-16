export type UserRole = "HR_USER" | "HR_ADMIN";
export type ConfidenceLevel = "high" | "medium" | "low";
export type DatePrecision = "day" | "month" | "year" | "unknown";
export type QueryStatus =
  | "draft"
  | "validating_input"
  | "parsing"
  | "normalizing"
  | "matching"
  | "completed"
  | "rejected_input"
  | "insufficient_data"
  | "completed_no_match"
  | "failed_retryable"
  | "expired";
