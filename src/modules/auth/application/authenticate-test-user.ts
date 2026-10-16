import type { AuthenticatedUser } from "../domain/user";
import type {
  AuthenticateTestUserDependencies,
  TestLoginInput,
} from "./ports";

export async function authenticateTestUser(
  input: TestLoginInput,
  dependencies: AuthenticateTestUserDependencies,
): Promise<AuthenticatedUser | null> {
  const username = input.name.trim().toLowerCase();
  if (!username) return null;

  const user = await dependencies.users.findByUsername(username);
  if (!user) return null;

  const passwordMatches = await dependencies.passwords.verify(
    input.password,
    user.credential,
  );
  if (!passwordMatches) return null;

  return {
    id: user.id,
    name: user.name,
    displayName: user.displayName,
    role: user.role,
  };
}

