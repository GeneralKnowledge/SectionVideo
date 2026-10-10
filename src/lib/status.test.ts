import { describe, expect, it } from "vitest";
import { sourceLabels } from "./status";

describe("source labels", () => {
  it("does not describe missing material as processed", () => {
    expect(
      sourceLabels({ availability: "available", retrievalError: null, transcript: "none", chapterCount: 0 }),
    ).toEqual(["Metadata only"]);
    expect(
      sourceLabels({ availability: "available", retrievalError: null, transcript: "available", chapterCount: 2 }),
    ).toEqual(["Transcript available", "Chapters available"]);
    expect(
      sourceLabels({ availability: "deleted", retrievalError: null, transcript: "none", chapterCount: 0 }),
    ).toEqual(["Manual review required"]);
    expect(
      sourceLabels({ availability: "available", retrievalError: "timed out", transcript: "failed", chapterCount: 0 }),
    ).toEqual(["Extraction failed"]);
  });
});
