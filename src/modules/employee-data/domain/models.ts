export interface EmployeeRecord {
  employeeId: string;
  name: string;
  email: string;
  currentDepartment: string;
  currentTitle: string;
}

export interface WorkExperienceRecord {
  employeeId: string;
  company: string;
  title: string;
  startDate: string;
  endDate: string | null;
}

export interface EducationRecord {
  employeeId: string;
  school: string;
  major: string;
  startDate: string;
  endDate: string | null;
}

export interface ParsedEmployeeData {
  employees: EmployeeRecord[];
  workExperiences: WorkExperienceRecord[];
  educationExperiences: EducationRecord[];
}

export interface EmployeeDataVersionSummary {
  id: string;
  importedAt: string;
  importedBy: string;
  employeeCount: number;
  workExperienceCount: number;
  educationCount: number;
}

export interface ImportAttemptSummary {
  id: string;
  attemptedAt: string;
  attemptedBy: string;
  status: "SUCCESS" | "FAILED";
  outcomeCode: string;
  issueCount: number;
  versionId: string | null;
}

export interface EmployeeDataOverview {
  activeVersion: EmployeeDataVersionSummary | null;
  recentAttempts: ImportAttemptSummary[];
}

export interface EmployeeProfile extends EmployeeRecord {
  versionId: string;
  workExperiences: WorkExperienceRecord[];
  educations: EducationRecord[];
}

export interface EmployeeDirectoryPage {
  versionId: string | null;
  items: EmployeeRecord[];
  total: number;
  page: number;
  pageSize: number;
}
