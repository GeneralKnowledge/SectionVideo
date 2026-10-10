import { describe, expect, it } from "vitest";
import { parseIsoDuration } from "./duration";

describe("ISO 8601 durations", () => {
  it("converts YouTube duration strings", () => {
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT5M")).toBe(300);
    expect(parseIsoDuration("PT45S")).toBe(45);
    expect(parseIsoDuration("P1D")).toBeNull();
    expect(parseIsoDuration(null)).toBeNull();
  });
});
