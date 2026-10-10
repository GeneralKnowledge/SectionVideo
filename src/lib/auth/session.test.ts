import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";
import { createSessionToken, readSessionToken } from "./session";

const secret = "unit-test-auth-secret-value";

describe("curator auth", () => {
  it("round-trips a session token and rejects a bad one", async () => {
    const token = await createSessionToken("curator-1", secret);
    expect(await readSessionToken(token, secret)).toBe("curator-1");
    expect(await readSessionToken(`${token}x`, secret)).toBeNull();
    expect(await readSessionToken(token, "another-secret-value-here")).toBeNull();
  });

  it("checks passwords", async () => {
    const hash = await hashPassword("correct-horse-battery", 4);
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });
});
