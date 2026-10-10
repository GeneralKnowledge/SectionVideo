import Link from "next/link";
import { notFound } from "next/navigation";
import { VideoStudio } from "@/components/video-studio";
import { getDb } from "@/lib/db";
import { readJsonArray } from "@/lib/json";
import type { SafetyFlag } from "@/lib/matching/welfare";
import { getVideoPage, listLessons } from "@/lib/services/queries";
import { formatClock } from "@/lib/timestamps";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const handle = getDb();
  const page = getVideoPage(handle, id);
  if (!page) notFound();
  const lessons = listLessons(handle).filter((lesson) => !lesson.removedAt);
  return (
    <>
      <p className="muted">
        {page.memberships.length > 0
          ? page.memberships.map((item) => (
              <Link key={item.playlist.id} href={`/playlists/${item.playlist.id}`}>
                {item.playlist.title}
                {" · "}
              </Link>
            ))
          : "Not in a playlist · "}
        {page.video.durationSeconds != null ? formatClock(page.video.durationSeconds) : "Duration unknown"}
      </p>
      <h2 className="page-title">{page.video.title}</h2>
      <VideoStudio
        video={{
          id: page.video.id,
          youtubeVideoId: page.video.youtubeVideoId,
          title: page.video.title,
          description: page.video.description,
          channelName: page.video.channelName,
          channelUrl: page.video.channelUrl,
          durationSeconds: page.video.durationSeconds,
          availabilityStatus: page.video.availabilityStatus,
          embedStatus: page.video.embedStatus,
          isFixture: page.video.isFixture,
          retrievalError: page.video.retrievalError,
        }}
        labels={page.labels}
        chapters={page.chapters.map((chapter) => ({
          id: chapter.id,
          title: chapter.title,
          startSeconds: chapter.startSeconds,
          endSeconds: chapter.endSeconds,
          source: chapter.source,
        }))}
        cues={page.segments.map((segment) => ({
          id: segment.id,
          startMs: segment.startMs,
          endMs: segment.endMs,
          text: segment.text,
        }))}
        transcriptNote={page.transcript?.provenanceNotes ?? null}
        suggestions={page.suggestions.map(({ suggestion, lesson }) => ({
          id: suggestion.id,
          lessonId: lesson?.lessonId ?? "unknown",
          lessonTitle: lesson?.title ?? "Missing lesson",
          startSeconds: suggestion.startSeconds,
          endSeconds: suggestion.endSeconds,
          timingGrounded: suggestion.timingGrounded,
          evidenceKind: suggestion.evidenceKind,
          evidenceText: suggestion.evidenceText,
          explanation: suggestion.explanation,
          confidence: suggestion.confidence,
          stageMismatch: suggestion.stageMismatch,
          prerequisiteNote: suggestion.prerequisiteNote,
          safetyFlags: readJsonArray(suggestion.safetyFlagsJson) as SafetyFlag[],
          provider: suggestion.provider,
          reviewStatus: suggestion.reviewStatus,
          stale: suggestion.stale,
        }))}
        lessons={lessons.map((lesson) => ({
          id: lesson.id,
          lessonId: lesson.lessonId,
          lessonKind: lesson.lessonKind,
          title: lesson.title,
          objective: lesson.learningObjectiveLabel,
        }))}
      />
    </>
  );
}
