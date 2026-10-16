import type { PasswordCredential } from "../../application/ports";

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function constantTimeEqual(
  first: Uint8Array<ArrayBuffer>,
  second: Uint8Array<ArrayBuffer>,
): boolean {
  if (first.length !== second.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference |= first[index] ^ second[index];
  }

  return difference === 0;
}

export async function verifyPassword(
  password: string,
  credential: PasswordCredential,
): Promise<boolean> {
  const sourceKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: decodeBase64(credential.salt),
      iterations: credential.iterations,
    },
    sourceKey,
    256,
  );

  return constantTimeEqual(
    new Uint8Array(derived),
    decodeBase64(credential.hash),
  );
}

