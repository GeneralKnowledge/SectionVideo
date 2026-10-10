import { describe, expect, it } from "vitest";
import { parsePlaylistUrl, parseVideoUrl } from "./parse";

describe("playlist and video URL parsing", () => {
  it("reads a playlist id and keeps an attached video id", () => {
    const parsed = parsePlaylistUrl(
      "https://www.youtube.com/watch?v=abcdefghijk&list=PLuC3XYn_061jfMKm84Dt5SH7R2gye2VHp",
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.playlist.playlistId).toBe("PLuC3XYn_061jfMKm84Dt5SH7R2gye2VHp");
    expect(parsed.playlist.videoId).toBe("abcdefghijk");
  });

  it("accepts youtu.be, shorts, and embed links", () => {
    expect(parseVideoUrl("https://youtu.be/abcdefghijk").ok && parseVideoUrl("https://youtu.be/abcdefghijk")).toBeTruthy();
    const short = parseVideoUrl("https://www.youtube.com/shorts/abcdefghijk");
    const embed = parseVideoUrl("https://www.youtube.com/embed/abcdefghijk");
    expect(short.ok && short.video.videoId).toBe("abcdefghijk");
    expect(embed.ok && embed.video.videoId).toBe("abcdefghijk");
  });

  it("refuses non-YouTube hosts", () => {
    expect(parsePlaylistUrl("https://evil.example/playlist?list=PLuC3XYn_061jfMKm84Dt5SH7R2gye2VHp").ok).toBe(false);
    expect(parseVideoUrl("http://169.254.169.254/latest/meta-data?v=abcdefghijk").ok).toBe(false);
    expect(parseVideoUrl("https://www.youtube.com.evil.com/watch?v=abcdefghijk").ok).toBe(false);
  });
});
