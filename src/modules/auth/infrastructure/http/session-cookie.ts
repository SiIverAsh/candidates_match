import type { AuthenticatedUser } from "../../domain/user";

const SESSION_COOKIE = "connection_finder_session";
const SESSION_DURATION_SECONDS = 8 * 60 * 60;

interface SessionPayload extends AuthenticatedUser {
  expiresAt: number;
}

function getSessionSecret(): string {
  const configuredSecret = process.env.AUTH_SESSION_SECRET;
  if (configuredSecret) return configuredSecret;
  if (process.env.NODE_ENV !== "production") {
    return "connection-finder-development-session-secret";
  }
  throw new Error("AUTH_SESSION_SECRET is required in production.");
}

function toBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function importSigningKey() {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(value: string): Promise<string> {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importSigningKey(),
    new TextEncoder().encode(value),
  );
  return toBase64Url(new Uint8Array(signature));
}

async function verifySignature(value: string, signature: string): Promise<boolean> {
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await importSigningKey(),
      fromBase64Url(signature),
      new TextEncoder().encode(value),
    );
  } catch {
    return false;
  }
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<SessionPayload>;
  return (
    typeof payload.id === "string" &&
    typeof payload.name === "string" &&
    typeof payload.displayName === "string" &&
    (payload.role === "HR_USER" || payload.role === "HR_ADMIN") &&
    typeof payload.expiresAt === "number"
  );
}

async function encodeSession(payload: SessionPayload): Promise<string> {
  const encodedPayload = toBase64Url(
    new TextEncoder().encode(JSON.stringify(payload)),
  );
  return `${encodedPayload}.${await sign(encodedPayload)}`;
}

async function decodeSession(value: string): Promise<SessionPayload | null> {
  const [encodedPayload, signature, extra] = value.split(".");
  if (!encodedPayload || !signature || extra) return null;
  if (!(await verifySignature(encodedPayload, signature))) return null;

  try {
    const payload = JSON.parse(
      new TextDecoder().decode(fromBase64Url(encodedPayload)),
    ) as unknown;
    if (!isSessionPayload(payload) || payload.expiresAt <= Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  for (const pair of cookieHeader.split(";")) {
    const separator = pair.indexOf("=");
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    }
  }
  return null;
}

export async function createSessionCookie(user: AuthenticatedUser): Promise<string> {
  const value = await encodeSession({
    ...user,
    expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000,
  });
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DURATION_SECONDS}${secure}`;
}

export function clearSessionCookie(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export async function getUserFromCookieHeader(
  cookieHeader: string | undefined,
): Promise<AuthenticatedUser | null> {
  const value = readCookie(cookieHeader, SESSION_COOKIE);
  const session = value ? await decodeSession(value) : null;
  if (!session) return null;
  return {
    id: session.id,
    name: session.name,
    displayName: session.displayName,
    role: session.role,
  };
}
