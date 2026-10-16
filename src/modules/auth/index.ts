import type { ProductModule } from "../module.types";

export const authModule: ProductModule = {
  id: "auth",
  name: "身份认证与权限",
  stage: "foundation",
  description: "内部登录、HR 与管理员角色鉴权。",
};

export type { AuthenticatedUser } from "./domain/user";
export { hasPermission } from "./domain/permissions";
export type { AuthPermission } from "./domain/permissions";
export {
  AdminAccessPage,
  DashboardPage,
  LoginPage,
} from "./presentation/pages";
