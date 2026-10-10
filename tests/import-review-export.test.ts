import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { openDatabase } from "@/lib/db/connection";
import { curators, playlistEntries, videos } from "@/lib/db/schema";
import { FIXTURE_LOOSE_LEAD_VTT } from "@/lib/fixtures/dev-playlist";
import { parseExportDocument } from "@/lib/export/schema";
import { buildExport } from "@/lib/services/export-document";
import { importDevelopmentFixture, importPlaylist } from "@/lib/services/importing";
import { approveSuggestion, generateSuggestions, rejectSuggestion } from "@/lib/services/review";
import { syncCurriculum } from "@/lib/services/curriculum-sync";
import { saveTranscript } from "@/lib/services/transcripts";
import type { ImportPayload } from "@/lib/youtube/types";

function setup() {
  const handle = openDatabase(":memory:");
  syncCurriculum(handle);
  handle.db
    .insert(curators)
    .values({
      id: "curator-1",
      email: "curator@example.com",
      passwordHash: "not-used",
      displayName: "Test Curator",
      createdAt: Date.now(),
    })
    .run();
  const actor = handle.db.select().from(curators).where(eq(curators.id, "curator-1")).get();
  if (!actor) throw new Error("missing curator");
  return { handle, actor };
}

describe("import, review, and export", () => {
  it("imports a playlist idempotently and keeps one row per video", () => {
    const { handle, actor } = setup();
    const first = importDevelopmentFixture(handle, actor.id);
    const second = importDevelopmentFixture(handle, actor.id);
    expect(second.playlistInternalId).toBe(first.playlistInternalId);
    expect(second.createdVideos).toBe(0);
    expect(second.updatedVideos).toBe(2);
    expect(handle.db.select().from(videos).all()).toHaveLength(2);
    expect(handle.db.select().from(playlistEntries).all()).toHaveLength(2);

    const duplicate: ImportPayload = {
      playlistId: "PLAYLISTDUP1",
      title: "Duplicate check",
      description: "",
      source: "metadata_file",
      isFixture: false,
      warnings: [],
      videos: [
        {
          videoId: "MOCKLEAD001",
          title: "Same video",
          description: "",
          channelName: "Other",
          durationSeconds: 10,
          thumbnailUrl: null,
          position: 0,
          availability: "available",
          embedStatus: "unknown",
        },
        {
          videoId: "MOCKLEAD001",
          title: "Same video again",
          description: "",
          channelName: "Other",
          durationSeconds: 10,
          thumbnailUrl: null,
          position: 1,
          availability: "available",
          embedStatus: "unknown",
        },
      ],
    };
    const imported = importPlaylist(handle, duplicate, actor.id);
    expect(imported.duplicateVideoIds).toEqual(["MOCKLEAD001"]);
    expect(handle.db.select().from(videos).all()).toHaveLength(2);
    expect(
      handle.db.select().from(playlistEntries).all().filter((entry) => entry.playlistId === imported.playlistInternalId),
    ).toHaveLength(1);
  });

  it("approves a real lesson id and exports only that approved segment", async () => {
    const { handle, actor } = setup();
    const imported = importDevelopmentFixture(handle, actor.id);
    const video = handle.db.select().from(videos).where(eq(videos.youtubeVideoId, "MOCKLEAD001")).get();
    const deleted = handle.db.select().from(videos).where(eq(videos.youtubeVideoId, "MOCKGONE001")).get();
    if (!video || !deleted) throw new Error("fixture videos missing");
    const transcript = saveTranscript(handle, {
      videoId: video.id,
      source: FIXTURE_LOOSE_LEAD_VTT,
      filename: "loose-lead.vtt",
      actorId: actor.id,
    });
    expect(transcript.ok).toBe(true);

    const suggestions = await generateSuggestions(handle, video.id, actor.id, null);
    expect(suggestions.ok).toBe(true);
    const row = handle.sqlite
      .prepare(
        `SELECT match_suggestions.id AS id, lesson_references.lesson_id AS lessonId, start_seconds AS startSeconds
         FROM match_suggestions
         JOIN lesson_references ON lesson_references.id = match_suggestions.lesson_reference_id
         WHERE match_suggestions.video_id = ? AND lesson_references.lesson_id = 'ex-lead-loose'`,
      )
      .get(video.id) as { id: string; lessonId: string; startSeconds: number } | undefined;
    expect(row?.lessonId).toBe("ex-lead-loose");
    expect(row?.startSeconds).toBe(45);

    const rejected = approveSuggestion(handle, actor, {
      suggestionId: row!.id,
      startSeconds: 45,
      endSeconds: 40,
      displayTitle: "Too short",
      viewingInstructions: ["Watch the lead."],
      curatorNotes: "",
    });
    expect(rejected.ok).toBe(false);

    const approved = approveSuggestion(handle, actor, {
      suggestionId: row!.id,
      startSeconds: 50,
      endSeconds: 88,
      displayTitle: "Loose-lead walking foundations",
      viewingInstructions: ["Watch how the reward follows a soft lead."],
      curatorNotes: "Edited the suggested window.",
    });
    expect(approved.ok).toBe(true);

    const beforeReject = buildExport(handle, "2026-10-10T18:30:00.000Z");
    expect(beforeReject.segments).toHaveLength(1);
    expect(beforeReject.segments[0]).toMatchObject({
      videoId: "MOCKLEAD001",
      lessonId: "ex-lead-loose",
      startSeconds: 50,
      endSeconds: 88,
      reviewStatus: "approved",
      fixture: true,
    });
    expect(beforeReject.segments.some((segment) => segment.videoId === "MOCKGONE001")).toBe(false);
    expect(beforeReject.warnings.some((warning) => warning.code === "fixture_video")).toBe(true);
    expect(() => parseExportDocument(beforeReject)).not.toThrow();

    const manual = handle.sqlite
      .prepare(
        `INSERT INTO match_suggestions (
          id, video_id, lesson_reference_id, start_seconds, end_seconds, timing_grounded,
          evidence_kind, evidence_text, evidence_refs_json, explanation, confidence,
          safety_flags_json, provider, curriculum_version, review_status, stale, created_at, updated_at
        )
        SELECT 'sug-deleted', ?, lesson_references.id, 0, NULL, 1,
          'manual', 'Unavailable fixture', '[]', 'Editorial note', 1,
          '[]', 'manual', lesson_references.curriculum_version, 'suggested', 0, 1, 1
        FROM lesson_references WHERE lesson_id = 'ex-lead-loose'`,
      )
      .run(deleted.id);
    expect(manual.changes).toBe(1);
    const deletedApproval = approveSuggestion(handle, actor, {
      suggestionId: "sug-deleted",
      startSeconds: 0,
      endSeconds: null,
      displayTitle: "Missing video",
      viewingInstructions: ["This video is gone."],
      curatorNotes: "",
    });
    expect(deletedApproval.ok).toBe(true);
    const withDeleted = buildExport(handle, "2026-10-10T18:31:00.000Z");
    const missing = withDeleted.segments.find((segment) => segment.videoId === "MOCKGONE001");
    expect(missing?.availability).toBe("deleted");
    expect(withDeleted.warnings.some((warning) => warning.code === "video_unavailable")).toBe(true);

    const rejection = rejectSuggestion(handle, actor, row!.id, "Needs another pass");
    expect(rejection.ok).toBe(true);
    const after = buildExport(handle, "2026-10-10T18:32:00.000Z");
    expect(after.segments.some((segment) => segment.videoId === "MOCKLEAD001")).toBe(false);
    expect(imported.entryCount).toBe(2);
  });
});
