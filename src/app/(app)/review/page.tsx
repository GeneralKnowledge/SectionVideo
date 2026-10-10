import { ReviewDeck } from "./review-deck";
import { getDb } from "@/lib/db";
import { readJsonArray } from "@/lib/json";
import type { SafetyFlag } from "@/lib/matching/welfare";
import { listReviewQueue } from "@/lib/services/queries";

export default function ReviewPage() {
  const queue = listReviewQueue(getDb());
  return (
    <>
      <h2 className="page-title">Review queue</h2>
      <p className="lede">
        Suggested matches wait here. Approving records your name and the time. Nothing is published automatically.
      </p>
      {queue.length === 0 ? (
        <section className="panel">
          <p>Nothing is waiting. Open a video and suggest matches, or add a manual mapping.</p>
        </section>
      ) : (
        <ReviewDeck
          items={queue.map(({ suggestion, video, lesson }) => ({
            id: suggestion.id,
            videoHref: video ? `/videos/${video.id}` : "/videos",
            videoTitle: video?.title ?? "Missing video",
            youtubeVideoId: video?.youtubeVideoId ?? "",
            lessonTitle: lesson?.title ?? "Missing lesson",
            lessonId: lesson?.lessonId ?? "",
            confidence: suggestion.confidence,
            evidenceText: suggestion.evidenceText,
            explanation: suggestion.explanation,
            startSeconds: suggestion.startSeconds,
            endSeconds: suggestion.endSeconds,
            safetyFlags: readJsonArray(suggestion.safetyFlagsJson) as SafetyFlag[],
            stageMismatch: suggestion.stageMismatch,
            prerequisiteNote: suggestion.prerequisiteNote,
            stale: suggestion.stale,
          }))}
        />
      )}
    </>
  );
}
