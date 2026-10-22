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

export const TEST_USER_2: TestUserRecord = {
  id: "test-user-2",
  name: "test2",
  displayName: "Test User 2",
  role: "HR_USER",
  credential: {
    algorithm: "PBKDF2-SHA256",
    iterations: 210_000,
    salt: "ojh4nXf+/gdkFp/8RJgo8A==",
    hash: "99WVj+FUJqNzLlQGJZsC1l543UGyV/OPNxAF8KREog4=",
  },
};

export const TEST_USER_1: TestUserRecord = {
  id: "test-user-1",
  name: "test1",
  displayName: "Test User 1",
  role: "HR_USER",
  credential: {
    algorithm: "PBKDF2-SHA256",
    iterations: 210_000,
    salt: "6oYZiRdKodi294aU1FWxYw==",
    hash: "5/0wD3arnQYcjUShU6LWV35lv7Q9+gHBC0pwRepczRc=",
  },
};

export const TEST_USER_3: TestUserRecord = {
  id: "test-user-3",
  name: "test3",
  displayName: "Test User 3",
  role: "HR_USER",
  credential: {
    algorithm: "PBKDF2-SHA256",
    iterations: 210_000,
    salt: "JIXbestXEhB2uhb5TVtWjA==",
    hash: "c5dDCDhvkVCTEPqy/zi0E59/acOInMEk4kePdcRr8Tk=",
  },
};

export const TEST_USER_4: TestUserRecord = {
  id: "test-user-4",
  name: "test4",
  displayName: "Test User 4",
  role: "HR_USER",
  credential: {
    algorithm: "PBKDF2-SHA256",
    iterations: 210_000,
    salt: "+OvM4hX0lSmgik31JRBiKA==",
    hash: "znrZ/ISdanYaXsGL5PNE++YGIRshCWtL8u90cR3Sszg=",
  },
};

const TEST_USERS = [TEST_USER, TEST_USER_1, TEST_USER_2, TEST_USER_3, TEST_USER_4];

export function findTestUserByName(name: string): TestUserRecord | null {
  if (process.env.NODE_ENV === "production") return null;
  return TEST_USERS.find((user) => user.name === name) ?? null;
}


