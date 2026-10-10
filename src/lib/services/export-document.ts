import { eq, inArray } from "drizzle-orm";
import type { DatabaseHandle } from "@/lib/db/connection";
import { curatedSegments, lessonReferences, videos } from "@/lib/db/schema";
import { parseExportDocument, type ExportDocument } from "@/lib/export/schema";
import { readJsonArray } from "@/lib/json";

export function buildExport(handle: DatabaseHandle, exportedAt = new Date().toISOString()): ExportDocument {
  const segments = handle.db
    .select()
    .from(curatedSegments)
    .where(inArray(curatedSegments.publicationStatus, ["approved", "published"]))
    .all()
    .sort((a, b) => a.createdAt - b.createdAt);

  const warnings: ExportDocument["warnings"] = [];
  const exported = [];

  for (const segment of segments) {
    const video = handle.db.select().from(videos).where(eq(videos.id, segment.videoId)).get();
    const lesson = handle.db
      .select()
      .from(lessonReferences)
      .where(eq(lessonReferences.id, segment.lessonReferenceId))
      .get();
    if (!video || !lesson) continue;
    const instructions = readJsonArray(segment.viewingInstructionsJson);
    if (instructions.length === 0) continue;

    if (video.isFixture) {
      warnings.push({
        code: "fixture_video",
        videoId: video.youtubeVideoId,
        lessonId: lesson.lessonId,
        message: "Fixture video. Do not publish this segment to Good Dog as a real recommendation.",
      });
    }
    if (video.availabilityStatus !== "available") {
      warnings.push({
        code: "video_unavailable",
        videoId: video.youtubeVideoId,
        lessonId: lesson.lessonId,
        message: `Video is ${video.availabilityStatus}. Show a fallback link instead of an embed.`,
      });
    }
    if (lesson.removedAt) {
      warnings.push({
        code: "lesson_removed",
        videoId: video.youtubeVideoId,
        lessonId: lesson.lessonId,
        message: "This lesson ID was not in the latest curriculum sync.",
      });
    }
    if (segment.embedStatus === "blocked") {
      warnings.push({
        code: "embed_blocked",
        videoId: video.youtubeVideoId,
        lessonId: lesson.lessonId,
        message: "Embedding is blocked. Link to the original video instead.",
      });
    }

    exported.push({
      videoId: video.youtubeVideoId,
      title: segment.displayTitle,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      lessonId: lesson.lessonId,
      lessonKind: lesson.lessonKind,
      learningObjectiveId: lesson.learningObjectiveId,
      learningObjective: lesson.learningObjectiveLabel ?? lesson.summary,
      viewingInstructions: instructions,
      sourceUrl: segment.sourceUrl,
      channelName: video.channelName,
      embedAllowed:
        segment.embedStatus === "allowed" ? true : segment.embedStatus === "blocked" ? false : null,
      availability: video.availabilityStatus,
      reviewStatus: segment.publicationStatus === "published" ? ("published" as const) : ("approved" as const),
      fixture: video.isFixture,
      curriculumVersion: lesson.curriculumVersion,
    });
  }

  return parseExportDocument({
    schemaVersion: 1,
    exportedAt,
    curriculumVersion: exported[0]?.curriculumVersion ?? "unknown",
    source: {
      application: "section-video",
      note: "Approved segments only. AI suggestions are never included unless a curator approved them.",
    },
    segments: exported,
    warnings,
  });
}
