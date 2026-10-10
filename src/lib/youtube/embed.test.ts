import { describe, expect, it } from "vitest";
import { buildEmbedUrl, canonicalWatchUrl, safeThumbnailUrl } from "./embed";

describe("YouTube embed URLs", () => {
  it("builds a privacy-enhanced embed with start and end", () => {
    const url = new URL(
      buildEmbedUrl({ videoId: "abcdefghijk", startSeconds: 125, endSeconds: 260 }),
    );
    expect(url.hostname).toBe("www.youtube-nocookie.com");
    expect(url.pathname).toBe("/embed/abcdefghijk");
    expect(url.searchParams.get("start")).toBe("125");
    expect(url.searchParams.get("end")).toBe("260");
    expect(url.searchParams.get("rel")).toBe("0");
  });

  it("builds a watch link at the selected time", () => {
    expect(canonicalWatchUrl("abcdefghijk", 125)).toBe(
      "https://www.youtube.com/watch?v=abcdefghijk&t=125s",
    );
  });

  it("rejects unexpected thumbnail hosts", () => {
    expect(safeThumbnailUrl("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg")).toContain("i.ytimg.com");
    expect(safeThumbnailUrl("https://evil.example/thumb.jpg")).toBeNull();
    expect(safeThumbnailUrl("javascript:alert(1)")).toBeNull();
  });
});
