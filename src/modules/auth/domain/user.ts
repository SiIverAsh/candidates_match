import type { UserRole } from "@/types";

export interface AuthenticatedUser {
  id: string;
  name: string;
  displayName: string;
  role: UserRole;
}
