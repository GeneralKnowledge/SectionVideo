import { describe, expect, it } from "vitest";
import { parseExportDocument } from "./schema";

describe("export schema", () => {
  it("accepts an approved segment and rejects a bad timestamp", () => {
    const document = parseExportDocument({
      schemaVersion: 1,
      exportedAt: "2026-10-10T18:00:00.000Z",
      curriculumVersion: "good-dog@abc",
      source: { application: "section-video", note: "Approved only." },
      segments: [
        {
          videoId: "MOCKLEAD001",
          title: "Loose lead",
          startSeconds: 45,
          endSeconds: 90,
          lessonId: "ex-lead-loose",
          lessonKind: "exercise",
          learningObjectiveId: "lead-walking",
          learningObjective: "Walking more comfortably on lead",
          viewingInstructions: ["Watch the slack lead."],
          sourceUrl: "https://www.youtube.com/watch?v=MOCKLEAD001&t=45s",
          channelName: "Fixture channel — sample data",
          embedAllowed: null,
          availability: "available",
          reviewStatus: "approved",
          fixture: true,
          curriculumVersion: "good-dog@abc",
        },
      ],
      warnings: [],
    });
    expect(document.segments[0]?.lessonId).toBe("ex-lead-loose");
    expect(() =>
      parseExportDocument({
        ...document,
        segments: [{ ...document.segments[0], endSeconds: 10 }],
      }),
    ).toThrow();
  });
});
