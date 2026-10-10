import { describe, expect, it } from "vitest";
import { resetRateLimits, takeToken } from "./rate-limit";

describe("rate limit", () => {
  it("blocks once the window is full", () => {
    resetRateLimits();
    expect(takeToken("signin:a", 2, 1000, 0)).toBe(true);
    expect(takeToken("signin:a", 2, 1000, 10)).toBe(true);
    expect(takeToken("signin:a", 2, 1000, 20)).toBe(false);
    expect(takeToken("signin:a", 2, 1000, 1000)).toBe(true);
  });
});
