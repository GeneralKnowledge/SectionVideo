import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DatabaseHandle } from "@/lib/db/connection";
import { videos } from "@/lib/db/schema";
import { extractChapters } from "@/lib/transcripts/chapters";
import { chapters } from "@/lib/db/schema";
import { fetchOEmbed } from "@/lib/youtube/api";
import { canonicalWatchUrl, safeThumbnailUrl } from "@/lib/youtube/embed";
import { parseVideoUrl } from "@/lib/youtube/parse";
import { recordAudit } from "./audit";

export async function addManualVideo(
  handle: DatabaseHandle,
  input: {
    url: string;
    title?: string;
    description?: string;
    channelName?: string;
    durationSeconds?: number | null;
    actorId: string | null;
  },
  fetchImpl?: typeof fetch,
): Promise<{ ok: true; videoId: string; created: boolean } | { ok: false; error: string }> {
  const parsed = parseVideoUrl(input.url);
  if (!parsed.ok) return parsed;
  const oembed = await fetchOEmbed(parsed.video.videoId, fetchImpl);
  const title = input.title?.trim() || (oembed.ok ? oembed.title : "");
  if (!title) {
    return {
      ok: false,
      error: oembed.ok
        ? "Add a title for this video."
        : `${oembed.error} Add a title to keep the record anyway.`,
    };
  }
  const now = Date.now();
  const existing = handle.db
    .select()
    .from(videos)
    .where(eq(videos.youtubeVideoId, parsed.video.videoId))
    .get();
  const stored = {
    title,
    description: input.description?.trim() || "",
    channelName: input.channelName?.trim() || (oembed.ok ? oembed.channelName : ""),
    channelUrl: oembed.ok ? oembed.channelUrl : null,
    durationSeconds: input.durationSeconds ?? existing?.durationSeconds ?? null,
    thumbnailUrl: safeThumbnailUrl(oembed.ok ? oembed.thumbnailUrl : null) ?? existing?.thumbnailUrl ?? null,
    canonicalUrl: canonicalWatchUrl(parsed.video.videoId),
    availabilityStatus: oembed.ok ? ("available" as const) : oembed.availability,
    embedStatus: oembed.ok ? oembed.embedStatus : oembed.embedStatus,
    metadataRetrievedAt: now,
    retrievalError: oembed.ok ? null : oembed.error,
    isFixture: false,
    updatedAt: now,
  };
  let internalId = existing?.id ?? "";
  const created = !existing;
  if (existing) {
    handle.db.update(videos).set(stored).where(eq(videos.id, existing.id)).run();
    internalId = existing.id;
  } else {
    internalId = nanoid();
    handle.db.insert(videos).values({ id: internalId, youtubeVideoId: parsed.video.videoId, ...stored, createdAt: now }).run();
  }
  if (stored.description) {
    handle.sqlite.prepare("DELETE FROM chapters WHERE video_id = ? AND source = 'description'").run(internalId);
    extractChapters(stored.description).forEach((chapter, position) => {
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
  recordAudit(handle, {
    actorId: input.actorId,
    action: created ? "video.manual_create" : "video.manual_update",
    entityType: "video",
    entityId: internalId,
    detail: { youtubeVideoId: parsed.video.videoId, oembed: oembed.ok },
  });
  return { ok: true, videoId: internalId, created };
}
