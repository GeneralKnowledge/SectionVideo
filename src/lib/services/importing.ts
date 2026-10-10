import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DatabaseHandle } from "@/lib/db/connection";
import { chapters, playlistEntries, playlists, videos } from "@/lib/db/schema";
import { DEV_PLAYLIST } from "@/lib/fixtures/dev-playlist";
import { extractChapters } from "@/lib/transcripts/chapters";
import { canonicalWatchUrl, safeThumbnailUrl } from "@/lib/youtube/embed";
import type { ImportPayload, ImportVideo } from "@/lib/youtube/types";
import { recordAudit } from "./audit";

export type ImportResult = {
  playlistInternalId: string;
  createdVideos: number;
  updatedVideos: number;
  entryCount: number;
  duplicateVideoIds: string[];
  status: "imported" | "partial" | "empty";
};

function dedupeVideos(input: ImportVideo[]): { videos: ImportVideo[]; duplicateVideoIds: string[] } {
  const seen = new Set<string>();
  const duplicateVideoIds: string[] = [];
  const unique: ImportVideo[] = [];
  const ordered = [...input].sort((a, b) => a.position - b.position);
  for (const video of ordered) {
    if (seen.has(video.videoId)) {
      duplicateVideoIds.push(video.videoId);
      continue;
    }
    seen.add(video.videoId);
    unique.push(video);
  }
  return { videos: unique, duplicateVideoIds };
}

export function importPlaylist(
  handle: DatabaseHandle,
  payload: ImportPayload,
  actorId: string | null = null,
): ImportResult {
  const now = Date.now();
  const deduped = dedupeVideos(payload.videos);
  let createdVideos = 0;
  let updatedVideos = 0;
  let playlistInternalId = "";

  const run = handle.sqlite.transaction(() => {
    const existingPlaylist = handle.db
      .select()
      .from(playlists)
      .where(eq(playlists.youtubePlaylistId, payload.playlistId))
      .get();
    const unavailable = deduped.videos.some((video) => video.availability !== "available");
    const status = deduped.videos.length === 0 ? "empty" : unavailable || payload.warnings.length > 0 ? "partial" : "imported";
    const errorDetails = [...payload.warnings, ...deduped.duplicateVideoIds.map((id) => `Duplicate video ${id} kept at its first position.`)].join(
      "\n",
    );

    if (existingPlaylist) {
      playlistInternalId = existingPlaylist.id;
      handle.db
        .update(playlists)
        .set({
          title: payload.title,
          description: payload.description,
          importStatus: status,
          source: payload.source,
          isFixture: payload.isFixture,
          lastImportedAt: now,
          errorDetails: errorDetails || null,
          itemCount: deduped.videos.length,
          updatedAt: now,
        })
        .where(eq(playlists.id, existingPlaylist.id))
        .run();
    } else {
      playlistInternalId = nanoid();
      handle.db
        .insert(playlists)
        .values({
          id: playlistInternalId,
          youtubePlaylistId: payload.playlistId,
          title: payload.title,
          description: payload.description,
          importStatus: status,
          source: payload.source,
          isFixture: payload.isFixture,
          lastImportedAt: now,
          errorDetails: errorDetails || null,
          itemCount: deduped.videos.length,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }

    const videoIds = new Map<string, string>();
    for (const video of deduped.videos) {
      const existing = handle.db
        .select()
        .from(videos)
        .where(eq(videos.youtubeVideoId, video.videoId))
        .get();
      const stored = {
        title: video.title,
        description: video.description,
        channelName: video.channelName,
        channelUrl: video.channelUrl ?? null,
        durationSeconds: video.durationSeconds,
        thumbnailUrl: safeThumbnailUrl(video.thumbnailUrl),
        canonicalUrl: canonicalWatchUrl(video.videoId),
        availabilityStatus: video.availability,
        embedStatus: video.embedStatus,
        metadataRetrievedAt: now,
        retrievalError: video.unavailableReason ?? null,
        isFixture: payload.isFixture,
        updatedAt: now,
      };
      if (existing) {
        updatedVideos += 1;
        handle.db.update(videos).set(stored).where(eq(videos.id, existing.id)).run();
        videoIds.set(video.videoId, existing.id);
      } else {
        createdVideos += 1;
        const id = nanoid();
        handle.db
          .insert(videos)
          .values({
            id,
            youtubeVideoId: video.videoId,
            ...stored,
            createdAt: now,
          })
          .run();
        videoIds.set(video.videoId, id);
      }

      const internalId = videoIds.get(video.videoId);
      if (!internalId) continue;
      handle.sqlite
        .prepare("DELETE FROM chapters WHERE video_id = ? AND source = 'description'")
        .run(internalId);
      const extracted = extractChapters(video.description);
      extracted.forEach((chapter, position) => {
        handle.db
          .insert(chapters)
          .values({
            id: nanoid(),
            videoId: internalId,
            title: chapter.title,
            startSeconds: chapter.startSeconds,
            endSeconds: chapter.endSeconds,
            source: "description",
            position,
          })
          .run();
      });
    }

    handle.sqlite.prepare("DELETE FROM playlist_entries WHERE playlist_id = ?").run(playlistInternalId);
    deduped.videos.forEach((video, position) => {
      const videoId = videoIds.get(video.videoId);
      if (!videoId) return;
      handle.db
        .insert(playlistEntries)
        .values({
          id: nanoid(),
          playlistId: playlistInternalId,
          videoId,
          position,
          unavailableReason: video.unavailableReason ?? null,
        })
        .run();
    });

    recordAudit(handle, {
      actorId,
      action: "playlist.import",
      entityType: "playlist",
      entityId: playlistInternalId,
      detail: {
        youtubePlaylistId: payload.playlistId,
        source: payload.source,
        createdVideos,
        updatedVideos,
        duplicates: deduped.duplicateVideoIds,
      },
    });
  });

  run();
  return {
    playlistInternalId,
    createdVideos,
    updatedVideos,
    entryCount: deduped.videos.length,
    duplicateVideoIds: deduped.duplicateVideoIds,
    status: deduped.videos.length === 0 ? "empty" : deduped.videos.some((video) => video.availability !== "available") || payload.warnings.length > 0 ? "partial" : "imported",
  };
}

export function importDevelopmentFixture(handle: DatabaseHandle, actorId: string | null): ImportResult {
  return importPlaylist(handle, DEV_PLAYLIST, actorId);
}

export function recordPlaylistFailure(
  handle: DatabaseHandle,
  input: { playlistId: string; title: string; error: string },
  actorId: string | null,
): string {
  const now = Date.now();
  const existing = handle.db
    .select()
    .from(playlists)
    .where(eq(playlists.youtubePlaylistId, input.playlistId))
    .get();
  if (existing) {
    handle.db
      .update(playlists)
      .set({
        importStatus: "failed",
        errorDetails: input.error,
        updatedAt: now,
      })
      .where(eq(playlists.id, existing.id))
      .run();
    return existing.id;
  }
  const id = nanoid();
  handle.db
    .insert(playlists)
    .values({
      id,
      youtubePlaylistId: input.playlistId,
      title: input.title,
      description: "",
      importStatus: "failed",
      source: "api",
      isFixture: false,
      lastImportedAt: now,
      errorDetails: input.error,
      itemCount: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  recordAudit(handle, {
    actorId,
    action: "playlist.import_failed",
    entityType: "playlist",
    entityId: id,
    detail: { error: input.error },
  });
  return id;
}
