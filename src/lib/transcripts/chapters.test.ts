import { describe, expect, it } from "vitest";
import { extractChapters } from "./chapters";

describe("chapter extraction", () => {
  it("reads timestamped description lines and sets the next line as the end", () => {
    const chapters = extractChapters("0:00 Greeting the dog\n0:45 Loose-lead walking\n2:10 Recall practice\n");
    expect(chapters).toEqual([
      { title: "Greeting the dog", startSeconds: 0, endSeconds: 45 },
      { title: "Loose-lead walking", startSeconds: 45, endSeconds: 130 },
      { title: "Recall practice", startSeconds: 130, endSeconds: null },
    ]);
  });

  it("does not treat a single timestamp as a chapter list", () => {
    expect(extractChapters("See 1:23 for the sit.")).toEqual([]);
  });
});
