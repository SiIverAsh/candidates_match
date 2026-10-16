import type { AuthenticatedUser } from "../domain/user";

export interface PasswordCredential {
  algorithm: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  hash: string;
}

export interface TestUserRecord extends AuthenticatedUser {
  credential: PasswordCredential;
}

export interface TestLoginInput {
  name: string;
  password: string;
}

export interface TestUserProvider {
  findByUsername(username: string): Promise<TestUserRecord | null> | TestUserRecord | null;
}

export interface PasswordVerifier {
  verify(password: string, credential: PasswordCredential): Promise<boolean>;
}

export interface AuthenticateTestUserDependencies {
  users: TestUserProvider;
  passwords: PasswordVerifier;
}
