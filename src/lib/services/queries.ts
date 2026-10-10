import { asc, desc, eq, like, or } from "drizzle-orm";
import type { DatabaseHandle } from "@/lib/db/connection";
import {
  chapters,
  curatedSegments,
  lessonReferences,
  matchSuggestions,
  playlistEntries,
  playlists,
  transcriptSegments,
  transcripts,
  videos,
} from "@/lib/db/schema";
import { readJsonArray, readJsonValue } from "@/lib/json";
import { sourceLabels } from "@/lib/status";

function count(handle: DatabaseHandle, sql: string): number {
  const row = handle.sqlite.prepare(sql).get() as { n: number };
  return row.n;
}

export function getOverview(handle: DatabaseHandle) {
  return {
    playlists: count(handle, "SELECT COUNT(*) AS n FROM playlists"),
    videos: count(handle, "SELECT COUNT(*) AS n FROM videos"),
    transcripts: count(
      handle,
      "SELECT COUNT(DISTINCT video_id) AS n FROM transcripts WHERE processing_status = 'available'",
    ),
    awaitingReview: count(
      handle,
      "SELECT COUNT(*) AS n FROM match_suggestions WHERE review_status = 'suggested'",
    ),
    approved: count(
      handle,
      "SELECT COUNT(*) AS n FROM curated_segments WHERE publication_status IN ('approved', 'published')",
    ),
    failedImports: count(handle, "SELECT COUNT(*) AS n FROM playlists WHERE import_status = 'failed'"),
    stale: count(handle, "SELECT COUNT(*) AS n FROM match_suggestions WHERE stale = 1"),
    partialPlaylists: count(handle, "SELECT COUNT(*) AS n FROM playlists WHERE import_status = 'partial'"),
    recentPlaylists: handle.db.select().from(playlists).orderBy(desc(playlists.updatedAt)).limit(6).all(),
    recentVideos: handle.db.select().from(videos).orderBy(desc(videos.updatedAt)).limit(8).all(),
  };
}

export function listPlaylists(handle: DatabaseHandle) {
  return handle.db.select().from(playlists).orderBy(desc(playlists.updatedAt)).all();
}

export function getPlaylist(handle: DatabaseHandle, id: string) {
  const playlist = handle.db.select().from(playlists).where(eq(playlists.id, id)).get();
  if (!playlist) return null;
  const entries = handle.db
    .select({
      position: playlistEntries.position,
      unavailableReason: playlistEntries.unavailableReason,
      video: videos,
    })
    .from(playlistEntries)
    .innerJoin(videos, eq(playlistEntries.videoId, videos.id))
    .where(eq(playlistEntries.playlistId, id))
    .orderBy(asc(playlistEntries.position))
    .all();
  return { playlist, entries };
}

export function listVideos(handle: DatabaseHandle, query = "") {
  const trimmed = query.trim();
  if (!trimmed) {
    return handle.db.select().from(videos).orderBy(desc(videos.updatedAt)).limit(100).all();
  }
  const pattern = `%${trimmed.replace(/[%_]/g, "")}%`;
  return handle.db
    .select()
    .from(videos)
    .where(
      or(
        like(videos.title, pattern),
        like(videos.channelName, pattern),
        like(videos.youtubeVideoId, pattern),
      ),
    )
    .limit(100)
    .all();
}

export function videoLabels(handle: DatabaseHandle, videoId: string) {
  const video = handle.db.select().from(videos).where(eq(videos.id, videoId)).get();
  if (!video) return [];
  const transcript = handle.db
    .select()
    .from(transcripts)
    .where(eq(transcripts.videoId, videoId))
    .all()
    .sort((a, b) => b.retrievedAt - a.retrievedAt)[0];
  const chapterCount = handle.db.select().from(chapters).where(eq(chapters.videoId, videoId)).all().length;
  const unavailable = ["deleted", "private", "unavailable", "age_restricted"].includes(
    video.availabilityStatus,
  );
  return sourceLabels({
    availability: video.availabilityStatus,
    retrievalError: unavailable ? null : video.retrievalError,
    transcript: transcript
      ? transcript.processingStatus === "available"
        ? "available"
        : transcript.processingStatus === "failed"
          ? "failed"
          : "none"
      : "none",
    chapterCount,
  });
}

export function getVideoPage(handle: DatabaseHandle, id: string) {
  const video = handle.db.select().from(videos).where(eq(videos.id, id)).get();
  if (!video) return null;
  const chapterRows = handle.db
    .select()
    .from(chapters)
    .where(eq(chapters.videoId, id))
    .all()
    .sort((a, b) => a.position - b.position);
  const transcript = handle.db
    .select()
    .from(transcripts)
    .where(eq(transcripts.videoId, id))
    .all()
    .sort((a, b) => b.retrievedAt - a.retrievedAt)[0] ?? null;
  const segments = transcript
    ? handle.db
        .select()
        .from(transcriptSegments)
        .where(eq(transcriptSegments.transcriptId, transcript.id))
        .all()
        .sort((a, b) => a.sourceIndex - b.sourceIndex)
    : [];
  const suggestionRows = handle.db
    .select()
    .from(matchSuggestions)
    .where(eq(matchSuggestions.videoId, id))
    .all()
    .sort((a, b) => b.confidence - a.confidence);
  const lessonIds = [...new Set(suggestionRows.map((row) => row.lessonReferenceId))];
  const lessonMap = new Map(
    lessonIds.map((lessonId) => [
      lessonId,
      handle.db.select().from(lessonReferences).where(eq(lessonReferences.id, lessonId)).get(),
    ]),
  );
  const curated = handle.db
    .select()
    .from(curatedSegments)
    .where(eq(curatedSegments.videoId, id))
    .all();
  const memberships = handle.db
    .select({ playlist: playlists, position: playlistEntries.position })
    .from(playlistEntries)
    .innerJoin(playlists, eq(playlistEntries.playlistId, playlists.id))
    .where(eq(playlistEntries.videoId, id))
    .all();
  return {
    video,
    chapters: chapterRows,
    transcript,
    segments,
    suggestions: suggestionRows.map((suggestion) => ({
      suggestion,
      lesson: lessonMap.get(suggestion.lessonReferenceId) ?? null,
    })),
    curated,
    memberships,
    labels: videoLabels(handle, id),
  };
}

export function listLessons(handle: DatabaseHandle, query = "") {
  const rows = handle.db.select().from(lessonReferences).all();
  const needle = query.trim().toLowerCase();
  return rows
    .filter((lesson) => {
      if (!needle) return true;
      return (
        lesson.title.toLowerCase().includes(needle) ||
        lesson.lessonId.toLowerCase().includes(needle) ||
        (lesson.learningObjectiveLabel ?? "").toLowerCase().includes(needle) ||
        lesson.searchText.toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

export function getLessonPage(handle: DatabaseHandle, lessonId: string) {
  const lesson = handle.db
    .select()
    .from(lessonReferences)
    .all()
    .find((item) => item.lessonId === lessonId);
  if (!lesson) return null;
  const suggestions = handle.db
    .select()
    .from(matchSuggestions)
    .where(eq(matchSuggestions.lessonReferenceId, lesson.id))
    .all();
  const curated = handle.db
    .select()
    .from(curatedSegments)
    .where(eq(curatedSegments.lessonReferenceId, lesson.id))
    .all();
  const videoIds = [...new Set([...suggestions.map((item) => item.videoId), ...curated.map((item) => item.videoId)])];
  const videoMap = new Map(
    videoIds.map((id) => [id, handle.db.select().from(videos).where(eq(videos.id, id)).get()]),
  );
  const allLessons = handle.db.select().from(lessonReferences).all();
  return {
    lesson,
    suggestions,
    curated,
    videoMap,
    instructions: readJsonArray(lesson.instructionsJson),
    lifeStages: readJsonArray(lesson.lifeStagesJson),
    prerequisites: readJsonArray(lesson.prerequisitesJson),
    aliases: readJsonValue<Array<{ lessonId: string; source: string }>>(lesson.crashAliasesJson, []),
    allLessons,
  };
}

export function listReviewQueue(handle: DatabaseHandle) {
  const suggestions = handle.db
    .select()
    .from(matchSuggestions)
    .where(eq(matchSuggestions.reviewStatus, "suggested"))
    .all()
    .sort((a, b) => b.confidence - a.confidence);
  return suggestions.map((suggestion) => ({
    suggestion,
    video: handle.db.select().from(videos).where(eq(videos.id, suggestion.videoId)).get() ?? null,
    lesson:
      handle.db
        .select()
        .from(lessonReferences)
        .where(eq(lessonReferences.id, suggestion.lessonReferenceId))
        .get() ?? null,
  }));
}

export function searchLibrary(handle: DatabaseHandle, query: string) {
  return {
    videos: listVideos(handle, query),
    lessons: listLessons(handle, query).slice(0, 40),
  };
}
