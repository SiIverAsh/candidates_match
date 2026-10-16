import type { TestUserRecord } from "../../application/ports";

export const TEST_USER: TestUserRecord = {
  id: "test-user",
  name: "test",
  displayName: "Test User",
  role: "HR_ADMIN",
  credential: {
    algorithm: "PBKDF2-SHA256",
    iterations: 210_000,
    salt: "SOc8h/k/h06WwWGtP7uejA==",
    hash: "mVpO5SmqRPjDiVh8HaOfkp6Tf6QnJzmSWcPJmq8R3Po=",
  },
};

export function findTestUserByName(name: string): TestUserRecord | null {
  if (process.env.NODE_ENV === "production") return null;
  return name === TEST_USER.name ? TEST_USER : null;
}


