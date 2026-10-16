import type { AuthenticatedUser } from "./user";

export type AuthPermission = "candidate:query" | "employee-data:import";

const ROLE_PERMISSIONS: Record<AuthenticatedUser["role"], AuthPermission[]> = {
  HR_USER: ["candidate:query"],
  HR_ADMIN: ["candidate:query", "employee-data:import"],
};

export function hasPermission(
  user: AuthenticatedUser,
  permission: AuthPermission,
): boolean {
  return ROLE_PERMISSIONS[user.role].includes(permission);
}
