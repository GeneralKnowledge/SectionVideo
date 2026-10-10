import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "curator_session";
const SESSION_DAYS = 14;

export function sessionSecret(secret = process.env.AUTH_SECRET): Uint8Array {
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET must be at least 16 characters.");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(userId: string, secret?: string): Promise<string> {
  return new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(sessionSecret(secret));
}

export async function readSessionToken(token: string, secret?: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, sessionSecret(secret));
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
