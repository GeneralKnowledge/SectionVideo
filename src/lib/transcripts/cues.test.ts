import { describe, expect, it } from "vitest";
import { parseSrt, parseVtt } from "./cues";

describe("transcript cues", () => {
  it("parses VTT cues and skips notes", () => {
    const result = parseVtt(`WEBVTT

NOTE Ignore this

00:00:45.000 --> 00:00:58.000
Watch the <c>leash</c> &amp; reward.

00:00:58.000 --> 00:01:12.000
Wait for slack.
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cues[0]).toMatchObject({ startMs: 45_000, endMs: 58_000, text: "Watch the leash & reward." });
    expect(result.cues).toHaveLength(2);
  });

  it("parses SRT commas", () => {
    const result = parseSrt(`1
00:01:02,000 --> 00:01:10,500
Come when called.
`);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.cues[0]?.startMs).toBe(62_000);
    expect(result.cues[0]?.text).toBe("Come when called.");
  });

  it("reports an empty VTT instead of pretending it worked", () => {
    const result = parseVtt("WEBVTT\n\n");
    expect(result.ok).toBe(false);
  });
});
