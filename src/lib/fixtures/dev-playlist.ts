import type { ImportPayload } from "@/lib/youtube/types";

/**
 * Labelled sample data for local development and tests.
 * These video IDs are not real YouTube videos and were not imported from a playlist.
 */
export const DEV_PLAYLIST: ImportPayload = {
  playlistId: "FIXTUREDEV01",
  title: "Development fixture (not a YouTube playlist)",
  description:
    "Sample records for exercising the curator without a YouTube API key. Do not publish these segments to Good Dog as real recommendations.",
  source: "fixture",
  isFixture: true,
  warnings: ["This playlist is labelled fixture data, not a live YouTube import."],
  videos: [
    {
      videoId: "MOCKLEAD001",
      title: "[Fixture] Loose-lead walking demonstration",
      description: [
        "Labelled fixture video. Not retrieved from YouTube.",
        "",
        "0:00 Greeting the dog",
        "0:45 Loose-lead walking",
        "2:10 Recall practice",
      ].join("\n"),
      channelName: "Fixture channel — sample data",
      channelUrl: null,
      durationSeconds: 180,
      thumbnailUrl: null,
      position: 0,
      availability: "available",
      embedStatus: "unknown",
      unavailableReason: null,
    },
    {
      videoId: "MOCKGONE001",
      title: "[Fixture] Deleted video",
      description: "Labelled fixture for an unavailable video. Not retrieved from YouTube.",
      channelName: "Fixture channel — sample data",
      channelUrl: null,
      durationSeconds: null,
      thumbnailUrl: null,
      position: 1,
      availability: "deleted",
      embedStatus: "blocked",
      unavailableReason: "Fixture: this entry stands in for a deleted video.",
    },
  ],
};

export const FIXTURE_LOOSE_LEAD_VTT = `WEBVTT

00:00:45.000 --> 00:00:58.000
Watch the leash. When the lead stays loose, mark and reward beside you.

00:00:58.000 --> 00:01:12.000
If the lead tightens, stop and wait for slack before you walk on.

00:01:12.000 --> 00:01:30.000
A few metres of loose-lead walking is enough. Reward the soft lead.
`;
