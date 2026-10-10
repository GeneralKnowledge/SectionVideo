import { describe, expect, it } from "vitest";
import { formatClock, parseClock, validateTiming } from "./timestamps";

describe("timestamps", () => {
  it("converts clocks and whole seconds", () => {
    expect(parseClock("2:10")).toBe(130);
    expect(parseClock("1:02:03")).toBe(3723);
    expect(parseClock("90")).toBe(90);
    expect(parseClock("2:99")).toBeNull();
    expect(formatClock(130)).toBe("2:10");
    expect(formatClock(3723)).toBe("1:02:03");
  });

  it("rejects an end time before the start or past the video", () => {
    expect(validateTiming({ startSeconds: 10, endSeconds: 10, durationSeconds: 30 }).ok).toBe(false);
    expect(validateTiming({ startSeconds: 40, endSeconds: null, durationSeconds: 30 }).ok).toBe(false);
    expect(validateTiming({ startSeconds: 10, endSeconds: 20, durationSeconds: 30 }).ok).toBe(true);
    expect(validateTiming({ startSeconds: 1.5, endSeconds: null }).ok).toBe(false);
  });
});
