import { describe, expect, it } from "vitest";
import { fetchYouTubePlaylist } from "./api";

describe("YouTube playlist fetch", () => {
  it("follows pagination and asks for video details in chunks", async () => {
    const urls: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
      urls.push(`${url.pathname}?${url.searchParams.toString()}`);
      expect(url.hostname).toBe("www.googleapis.com");
      if (url.pathname.endsWith("/playlistItems")) {
        if (!url.searchParams.get("pageToken")) {
          return Response.json({
            nextPageToken: "NEXT",
            items: [
              {
                snippet: { title: "First", position: 0 },
                contentDetails: { videoId: "abcdefghijk" },
                status: { privacyStatus: "public" },
              },
            ],
          });
        }
        return Response.json({
          items: [
            {
              snippet: { title: "Deleted video", position: 1 },
              contentDetails: { videoId: "zzzdeleted1" },
              status: { privacyStatus: "public" },
            },
            {
              snippet: { title: "Second", position: 2 },
              contentDetails: { videoId: "bbbccccddde" },
            },
          ],
        });
      }
      if (url.pathname.endsWith("/playlists")) {
        return Response.json({
          items: [{ snippet: { title: "Candidate playlist", description: "Described" } }],
        });
      }
      const ids = url.searchParams.get("id") ?? "";
      expect(ids.split(",").length).toBeLessThanOrEqual(2);
      return Response.json({
        items: ids.split(",").filter((id) => id !== "zzzdeleted1").map((id) => ({
          id,
          snippet: { title: `Title ${id}`, description: "Full description", channelTitle: "Channel" },
          contentDetails: { duration: "PT2M" },
          status: { embeddable: true, privacyStatus: "public" },
        })),
      });
    };

    const result = await fetchYouTubePlaylist({
      playlistId: "PLuC3XYn_061jfMKm84Dt5SH7R2gye2VHp",
      apiKey: "secret-key",
      fetchImpl,
      sleep: async () => undefined,
      videoChunkSize: 2,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.payload.videos.map((video) => video.videoId)).toEqual([
      "abcdefghijk",
      "zzzdeleted1",
      "bbbccccddde",
    ]);
    expect(result.payload.videos[1]?.availability).toBe("deleted");
    expect(result.payload.videos[0]?.durationSeconds).toBe(120);
    expect(result.payload.videos[0]?.embedStatus).toBe("allowed");
    expect(urls.some((url) => url.includes("pageToken=NEXT"))).toBe(true);
    expect(urls.some((url) => url.includes("secret-key"))).toBe(true);
    expect(result.payload.title).toBe("Candidate playlist");
  });

  it("retries server errors and then reports a private playlist", async () => {
    let attempts = 0;
    const result = await fetchYouTubePlaylist({
      playlistId: "PLuC3XYn_061gRfPD36FvekujhPRXSlxde",
      apiKey: "secret-key",
      sleep: async () => undefined,
      fetchImpl: async () => {
        attempts += 1;
        if (attempts < 3) return new Response("busy", { status: 503 });
        return new Response("private", { status: 404 });
      },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/private or deleted/i);
    expect(result.error).not.toContain("secret-key");
    expect(attempts).toBe(3);
  });

  it("does not call the network without a key", async () => {
    let called = false;
    const result = await fetchYouTubePlaylist({
      playlistId: "PLuC3XYn_061jfMKm84Dt5SH7R2gye2VHp",
      apiKey: "",
      fetchImpl: async () => {
        called = true;
        return new Response("no");
      },
    });
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });
});
