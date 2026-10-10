import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { DatabaseHandle } from "@/lib/db/connection";
import {
  curatedSegments,
  lessonReferences,
  matchSuggestions,
  videos,
  type Curator,
} from "@/lib/db/schema";
import { readJsonArray } from "@/lib/json";
import { dedupeSuggestions, suggestMatches, type LessonProfile, type SuggestionDraft } from "@/lib/matching/deterministic";
import { buildMatchingPrompt, parseModelJson, validateLlmMatches, type LlmContext } from "@/lib/matching/llm";
import { validateTiming } from "@/lib/timestamps";
import { canonicalWatchUrl } from "@/lib/youtube/embed";
import { recordAudit } from "./audit";

export type LlmClient = {
  complete(prompt: string): Promise<string>;
};

function profilesFor(handle: DatabaseHandle): Array<LessonProfile & { referenceId: string; version: string }> {
  return handle.db
    .select()
    .from(lessonReferences)
    .all()
    .filter((lesson) => !lesson.removedAt)
    .map((lesson) => ({
      referenceId: lesson.id,
      version: lesson.curriculumVersion,
      lessonId: lesson.lessonId,
      lessonKind: lesson.lessonKind,
      title: lesson.title,
      learningObjectiveLabel: lesson.learningObjectiveLabel,
      keywords: readJsonArray(lesson.keywordsJson),
      lifeStages: readJsonArray(lesson.lifeStagesJson),
      prerequisiteIds: readJsonArray(lesson.prerequisitesJson),
    }));
}

export async function generateSuggestions(
  handle: DatabaseHandle,
  videoId: string,
  actorId: string | null,
  llm: LlmClient | null = null,
): Promise<{ ok: true; count: number; llmNote: string | null } | { ok: false; error: string }> {
  const video = handle.db.select().from(videos).where(eq(videos.id, videoId)).get();
  if (!video) return { ok: false, error: "Video not found." };
  const lessons = profilesFor(handle);
  if (lessons.length === 0) return { ok: false, error: "Sync the Good Dog curriculum before matching." };

  const transcript = handle.sqlite
    .prepare(
      "SELECT id FROM transcripts WHERE video_id = ? AND processing_status = 'available' ORDER BY retrieved_at DESC LIMIT 1",
    )
    .get(videoId) as { id: string } | undefined;
  const segments = transcript
    ? (handle.sqlite
        .prepare(
          "SELECT source_index AS sourceIndex, start_ms AS startMs, end_ms AS endMs, text FROM transcript_segments WHERE transcript_id = ? ORDER BY source_index",
        )
        .all(transcript.id) as Array<{ sourceIndex: number; startMs: number; endMs: number; text: string }>)
    : [];
  const chapterRows = handle.sqlite
    .prepare(
      "SELECT id, title, start_seconds AS startSeconds, end_seconds AS endSeconds FROM chapters WHERE video_id = ? ORDER BY position",
    )
    .all(videoId) as Array<{ id: string; title: string; startSeconds: number; endSeconds: number | null }>;

  let drafts = suggestMatches({
    lessons,
    segments: segments.map((segment) => ({
      ref: `segment:${segment.sourceIndex}`,
      startSeconds: Math.floor(segment.startMs / 1000),
      endSeconds: Math.ceil(segment.endMs / 1000),
      text: segment.text,
    })),
    chapters: chapterRows.map((chapter) => ({
      ref: `chapter:${chapter.id}`,
      startSeconds: chapter.startSeconds,
      endSeconds: chapter.endSeconds ?? chapter.startSeconds + 1,
      text: chapter.title,
    })),
    title: video.title,
    description: video.description,
  });

  let llmNote: string | null = null;
  if (llm) {
    const windows = [
      ...segments.map((segment) => ({
        startSeconds: Math.floor(segment.startMs / 1000),
        endSeconds: Math.ceil(segment.endMs / 1000),
        text: segment.text,
      })),
      ...chapterRows.map((chapter) => ({
        startSeconds: chapter.startSeconds,
        endSeconds: chapter.endSeconds ?? Math.min((video.durationSeconds ?? chapter.startSeconds + 30), chapter.startSeconds + 30),
        text: chapter.title,
      })),
    ].filter((window) => window.endSeconds > window.startSeconds);
    const context: LlmContext = {
      videoId: video.youtubeVideoId,
      lessons: lessons.map((lesson) => ({
        lessonId: lesson.lessonId,
        lessonKind: lesson.lessonKind,
        title: lesson.title,
      })),
      windows,
    };
    try {
      const rawText = await llm.complete(buildMatchingPrompt(context));
      const decision = validateLlmMatches(parseModelJson(rawText), context);
      drafts = dedupeSuggestions([...drafts, ...decision.accepted]);
      llmNote =
        decision.rejected.length > 0
          ? `The model returned ${decision.accepted.length} usable match(es). ${decision.rejected.length} response(s) were rejected.`
          : decision.accepted.length > 0
            ? "The model added validated matches."
            : "The model returned no usable matches. Deterministic suggestions were kept.";
    } catch {
      llmNote = "The model request failed. Deterministic suggestions were kept.";
    }
  }

  const now = Date.now();
  const byLesson = new Map(lessons.map((lesson) => [`${lesson.lessonKind}:${lesson.lessonId}`, lesson]));
  const insertable = drafts.filter((draft): draft is SuggestionDraft & { lessonId: string } =>
    byLesson.has(`${draft.lessonKind}:${draft.lessonId}`),
  );

  const write = handle.sqlite.transaction(() => {
    handle.sqlite
      .prepare(
        "DELETE FROM match_suggestions WHERE video_id = ? AND review_status = 'suggested' AND provider IN ('deterministic', 'llm')",
      )
      .run(videoId);
    for (const draft of insertable) {
      const lesson = byLesson.get(`${draft.lessonKind}:${draft.lessonId}`);
      if (!lesson) continue;
      handle.db
        .insert(matchSuggestions)
        .values({
          id: nanoid(),
          videoId,
          lessonReferenceId: lesson.referenceId,
          startSeconds: draft.startSeconds,
          endSeconds: draft.endSeconds,
          timingGrounded: draft.timingGrounded,
          evidenceKind: draft.evidenceKind,
          evidenceText: draft.evidenceText,
          evidenceRefsJson: JSON.stringify(draft.evidenceRefs),
          explanation: draft.explanation,
          confidence: draft.confidence,
          stageMismatch: draft.stageMismatch,
          prerequisiteNote: draft.prerequisiteNote,
          safetyFlagsJson: JSON.stringify(draft.safetyFlags),
          provider: draft.provider,
          providerMetadataJson: null,
          curriculumVersion: lesson.version,
          reviewStatus: "suggested",
          reviewerId: null,
          reviewedAt: null,
          curatorNotes: null,
          stale: false,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    recordAudit(handle, {
      actorId,
      action: "suggestions.generate",
      entityType: "video",
      entityId: videoId,
      detail: { count: insertable.length, llm: Boolean(llm) },
    });
  });
  write();
  return { ok: true, count: insertable.length, llmNote };
}

export function createManualSuggestion(
  handle: DatabaseHandle,
  actor: Curator,
  input: {
    videoId: string;
    lessonReferenceId: string;
    startSeconds: number;
    endSeconds: number | null;
    note: string;
  },
): { ok: true; suggestionId: string } | { ok: false; error: string } {
  const video = handle.db.select().from(videos).where(eq(videos.id, input.videoId)).get();
  const lesson = handle.db
    .select()
    .from(lessonReferences)
    .where(eq(lessonReferences.id, input.lessonReferenceId))
    .get();
  if (!video) return { ok: false, error: "Video not found." };
  if (!lesson || lesson.removedAt) return { ok: false, error: "Choose a current Good Dog lesson." };
  const timing = validateTiming({
    startSeconds: input.startSeconds,
    endSeconds: input.endSeconds,
    durationSeconds: video.durationSeconds,
  });
  if (!timing.ok) return timing;
  const now = Date.now();
  const suggestionId = nanoid();
  handle.db
    .insert(matchSuggestions)
    .values({
      id: suggestionId,
      videoId: video.id,
      lessonReferenceId: lesson.id,
      startSeconds: input.startSeconds,
      endSeconds: input.endSeconds,
      timingGrounded: true,
      evidenceKind: "manual",
      evidenceText: input.note.trim() || "Timestamps entered by the curator.",
      evidenceRefsJson: JSON.stringify(["manual"]),
      explanation:
        "Curator-entered mapping. The explanation is editorial context, not a transcript and not trainer certification.",
      confidence: 1,
      stageMismatch: null,
      prerequisiteNote: null,
      safetyFlagsJson: JSON.stringify([]),
      provider: "manual",
      providerMetadataJson: null,
      curriculumVersion: lesson.curriculumVersion,
      reviewStatus: "suggested",
      reviewerId: null,
      reviewedAt: null,
      curatorNotes: input.note.trim() || null,
      stale: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  recordAudit(handle, {
    actorId: actor.id,
    action: "suggestion.manual",
    entityType: "match_suggestion",
    entityId: suggestionId,
    detail: { lessonId: lesson.lessonId, videoId: video.youtubeVideoId },
  });
  return { ok: true, suggestionId };
}

export function approveSuggestion(
  handle: DatabaseHandle,
  actor: Curator,
  input: {
    suggestionId: string;
    startSeconds: number;
    endSeconds: number | null;
    displayTitle: string;
    viewingInstructions: string[];
    curatorNotes: string;
  },
): { ok: true; segmentId: string } | { ok: false; error: string } {
  const suggestion = handle.db
    .select()
    .from(matchSuggestions)
    .where(eq(matchSuggestions.id, input.suggestionId))
    .get();
  if (!suggestion) return { ok: false, error: "Suggestion not found." };
  const video = handle.db.select().from(videos).where(eq(videos.id, suggestion.videoId)).get();
  const lesson = handle.db
    .select()
    .from(lessonReferences)
    .where(eq(lessonReferences.id, suggestion.lessonReferenceId))
    .get();
  if (!video || !lesson) return { ok: false, error: "The video or lesson for this suggestion is missing." };
  if (lesson.removedAt) {
    return { ok: false, error: "That Good Dog lesson is no longer in the synced catalogue." };
  }
  const timing = validateTiming({
    startSeconds: input.startSeconds,
    endSeconds: input.endSeconds,
    durationSeconds: video.durationSeconds,
  });
  if (!timing.ok) return timing;
  const instructions = input.viewingInstructions.map((line) => line.trim()).filter(Boolean);
  if (!input.displayTitle.trim()) return { ok: false, error: "Add a display title." };
  if (instructions.length === 0) return { ok: false, error: "Add at least one viewing instruction." };

  const now = Date.now();
  const existing = handle.db
    .select()
    .from(curatedSegments)
    .where(eq(curatedSegments.suggestionId, suggestion.id))
    .get();
  const segmentId = existing?.id ?? nanoid();
  const values = {
    videoId: video.id,
    lessonReferenceId: lesson.id,
    suggestionId: suggestion.id,
    startSeconds: input.startSeconds,
    endSeconds: input.endSeconds,
    displayTitle: input.displayTitle.trim(),
    learningContext: suggestion.explanation,
    viewingInstructionsJson: JSON.stringify(instructions),
    creatorAttribution: video.channelName
      ? `${video.channelName} on YouTube`
      : "Original channel on YouTube",
    reviewerNotes: input.curatorNotes.trim() || null,
    publicationStatus: "approved" as const,
    reviewerId: actor.id,
    reviewedAt: now,
    sourceUrl: canonicalWatchUrl(video.youtubeVideoId, input.startSeconds),
    embedStatus: video.embedStatus,
    lastVerifiedAt: now,
    updatedAt: now,
  };

  const write = handle.sqlite.transaction(() => {
    if (existing) {
      handle.db.update(curatedSegments).set(values).where(eq(curatedSegments.id, existing.id)).run();
    } else {
      handle.db.insert(curatedSegments).values({ ...values, id: segmentId, createdAt: now }).run();
    }
    handle.db
      .update(matchSuggestions)
      .set({
        startSeconds: input.startSeconds,
        endSeconds: input.endSeconds,
        timingGrounded: true,
        reviewStatus: "approved",
        reviewerId: actor.id,
        reviewedAt: now,
        curatorNotes: input.curatorNotes.trim() || null,
        updatedAt: now,
      })
      .where(eq(matchSuggestions.id, suggestion.id))
      .run();
    recordAudit(handle, {
      actorId: actor.id,
      action: "segment.approve",
      entityType: "curated_segment",
      entityId: segmentId,
      detail: {
        lessonId: lesson.lessonId,
        videoId: video.youtubeVideoId,
        startSeconds: input.startSeconds,
        endSeconds: input.endSeconds,
      },
    });
  });
  write();
  return { ok: true, segmentId };
}

export function rejectSuggestion(
  handle: DatabaseHandle,
  actor: Curator,
  suggestionId: string,
  curatorNotes: string,
): { ok: true } | { ok: false; error: string } {
  const suggestion = handle.db
    .select()
    .from(matchSuggestions)
    .where(eq(matchSuggestions.id, suggestionId))
    .get();
  if (!suggestion) return { ok: false, error: "Suggestion not found." };
  const now = Date.now();
  const write = handle.sqlite.transaction(() => {
    handle.db
      .update(matchSuggestions)
      .set({
        reviewStatus: "rejected",
        reviewerId: actor.id,
        reviewedAt: now,
        curatorNotes: curatorNotes.trim() || suggestion.curatorNotes,
        updatedAt: now,
      })
      .where(eq(matchSuggestions.id, suggestionId))
      .run();
    handle.db
      .update(curatedSegments)
      .set({ publicationStatus: "draft", updatedAt: now, reviewerNotes: curatorNotes.trim() || null })
      .where(eq(curatedSegments.suggestionId, suggestionId))
      .run();
    recordAudit(handle, {
      actorId: actor.id,
      action: "suggestion.reject",
      entityType: "match_suggestion",
      entityId: suggestionId,
      detail: { notes: curatorNotes.trim() },
    });
  });
  write();
  return { ok: true };
}

export function returnSegmentToDraft(
  handle: DatabaseHandle,
  actor: Curator,
  segmentId: string,
): { ok: true } | { ok: false; error: string } {
  const segment = handle.db.select().from(curatedSegments).where(eq(curatedSegments.id, segmentId)).get();
  if (!segment) return { ok: false, error: "Segment not found." };
  const now = Date.now();
  const write = handle.sqlite.transaction(() => {
    handle.db
      .update(curatedSegments)
      .set({ publicationStatus: "draft", updatedAt: now })
      .where(eq(curatedSegments.id, segmentId))
      .run();
    if (segment.suggestionId) {
      handle.db
        .update(matchSuggestions)
        .set({ reviewStatus: "draft", reviewerId: actor.id, reviewedAt: now, updatedAt: now })
        .where(and(eq(matchSuggestions.id, segment.suggestionId)))
        .run();
    }
    recordAudit(handle, {
      actorId: actor.id,
      action: "segment.return_to_draft",
      entityType: "curated_segment",
      entityId: segmentId,
      detail: {},
    });
  });
  write();
  return { ok: true };
}
