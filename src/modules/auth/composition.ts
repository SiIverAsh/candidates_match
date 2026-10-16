import { authenticateTestUser as authenticate } from "./application/authenticate-test-user";
import type { TestLoginInput } from "./application/ports";
import { findTestUserByName } from "./infrastructure/testing/test-user";
import { verifyPassword } from "./infrastructure/testing/password";

export function authenticateTestUser(input: TestLoginInput) {
  return authenticate(input, {
    users: { findByUsername: findTestUserByName },
    passwords: { verify: verifyPassword },
  });
}

export {
  clearSessionCookie,
  createSessionCookie,
  getUserFromCookieHeader,
} from "./infrastructure/http/session-cookie";
