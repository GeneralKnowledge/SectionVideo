import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DatabaseHandle } from "@/lib/db/connection";
import { chapters, transcriptSegments, transcripts, videos } from "@/lib/db/schema";
import { parseTranscript } from "@/lib/transcripts/cues";
import { recordAudit } from "./audit";

const MAX_CHARS = 1_000_000;

export function saveTranscript(
  handle: DatabaseHandle,
  input: {
    videoId: string;
    source: string;
    filename?: string;
    language?: string;
    actorId: string | null;
  },
): { ok: true; cueCount: number } | { ok: false; error: string } {
  const video = handle.db.select().from(videos).where(eq(videos.id, input.videoId)).get();
  if (!video) return { ok: false, error: "Video not found." };
  if (input.source.length > MAX_CHARS) {
    return { ok: false, error: "That transcript is too large to store." };
  }
  const parsed = parseTranscript(input.source, input.filename ?? "");
  if (!parsed.ok) return parsed;
  const now = Date.now();
  const transcriptId = nanoid();
  const write = handle.sqlite.transaction(() => {
    const previous = handle.db.select().from(transcripts).where(eq(transcripts.videoId, video.id)).all();
    for (const item of previous) {
      handle.sqlite.prepare("DELETE FROM transcript_segments WHERE transcript_id = ?").run(item.id);
      handle.sqlite.prepare("DELETE FROM transcripts WHERE id = ?").run(item.id);
    }
    handle.db
      .insert(transcripts)
      .values({
        id: transcriptId,
        videoId: video.id,
        sourceType: parsed.sourceType,
        language: input.language?.trim() || "en",
        retrievedAt: now,
        provenanceNotes: input.filename
          ? `Uploaded by a curator from ${input.filename}. YouTube captions were not downloaded.`
          : "Pasted by a curator. YouTube captions were not downloaded.",
        processingStatus: "available",
      })
      .run();
    parsed.cues.forEach((cue, index) => {
      handle.db
        .insert(transcriptSegments)
        .values({
          id: nanoid(),
          transcriptId,
          startMs: cue.startMs,
          endMs: cue.endMs,
          text: cue.text,
          sourceIndex: index,
        })
        .run();
    });
    recordAudit(handle, {
      actorId: input.actorId,
      action: "transcript.save",
      entityType: "video",
      entityId: video.id,
      detail: { sourceType: parsed.sourceType, cueCount: parsed.cues.length },
    });
  });
  write();
  return { ok: true, cueCount: parsed.cues.length };
}

export function addManualChapter(
  handle: DatabaseHandle,
  input: { videoId: string; title: string; startSeconds: number; endSeconds: number | null; actorId: string | null },
): { ok: true } | { ok: false; error: string } {
  const video = handle.db.select().from(videos).where(eq(videos.id, input.videoId)).get();
  if (!video) return { ok: false, error: "Video not found." };
  if (!input.title.trim()) return { ok: false, error: "Add a chapter title." };
  if (!Number.isInteger(input.startSeconds) || input.startSeconds < 0) {
    return { ok: false, error: "Chapter start must be a whole number of seconds." };
  }
  const position = handle.db.select().from(chapters).where(eq(chapters.videoId, video.id)).all().length;
  handle.db
    .insert(chapters)
    .values({
      id: nanoid(),
      videoId: video.id,
      title: input.title.trim(),
      startSeconds: input.startSeconds,
      endSeconds: input.endSeconds,
      source: "manual",
      position,
    })
    .run();
  recordAudit(handle, {
    actorId: input.actorId,
    action: "chapter.manual",
    entityType: "video",
    entityId: video.id,
    detail: { title: input.title.trim(), startSeconds: input.startSeconds },
  });
  return { ok: true };
}
