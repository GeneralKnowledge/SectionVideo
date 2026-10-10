import Link from "next/link";
import { notFound } from "next/navigation";
import { draftAction } from "@/lib/actions/curator";
import { StatusPill } from "@/components/pills";
import { conflictingAliases } from "@/lib/curriculum/snapshot";
import { loadCurriculumSnapshot } from "@/lib/curriculum/snapshot";
import { getDb } from "@/lib/db";
import { getLessonPage } from "@/lib/services/queries";
import { formatClock } from "@/lib/timestamps";

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  const page = getLessonPage(getDb(), lessonId);
  if (!page) notFound();
  const conflicts = conflictingAliases(loadCurriculumSnapshot()).filter((item) =>
    page.aliases.some((alias) => alias.lessonId === item.lessonId),
  );
  return (
    <>
      <p className="muted">
        {page.lesson.lessonKind} · {page.lesson.lessonId}
        {page.lesson.trainingStageId ? ` · ${page.lesson.trainingStageId}` : ""}
      </p>
      <h2 className="page-title">{page.lesson.title}</h2>
      <p className="lede">{page.lesson.summary}</p>
      {page.lesson.removedAt ? (
        <p className="note">This lesson was not in the latest curriculum sync. Existing segments were kept.</p>
      ) : null}
      {conflicts.map((conflict) => (
        <p key={conflict.lessonId} className="note">
          Good Dog maps {conflict.lessonId} to more than one exercise: {conflict.exerciseIds.join(" and ")}. Both mappings are copied from the repository; this curator does not choose between them.
        </p>
      ))}
      <div className="two">
        <section className="panel">
          <h3>What Good Dog teaches</h3>
          {page.lesson.learningObjectiveLabel ? <p>Objective: {page.lesson.learningObjectiveLabel}</p> : null}
          {page.lifeStages.length > 0 ? <p>Life stages: {page.lifeStages.join(", ")}</p> : null}
          {page.prerequisites.length > 0 ? <p>Prerequisites: {page.prerequisites.join(", ")}</p> : null}
          {page.lesson.safetyNotes ? <p className="note">{page.lesson.safetyNotes}</p> : null}
          <ol>
            {page.instructions.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {page.aliases.length > 0 ? (
            <>
              <h3>Crash-course aliases</h3>
              <ul>
                {page.aliases.map((alias) => (
                  <li key={`${alias.lessonId}-${alias.source}`}>
                    {alias.lessonId}
                    <div className="muted">{alias.source}</div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        <section className="stack">
          <article className="panel">
            <h3>Approved segments</h3>
            {page.curated.length === 0 ? <p className="muted">None approved yet.</p> : null}
            {page.curated.map((segment) => {
              const video = page.videoMap.get(segment.videoId);
              return (
                <div key={segment.id}>
                  <StatusPill status={segment.publicationStatus} />{" "}
                  <Link href={video ? `/videos/${video.id}` : "/videos"}>{segment.displayTitle}</Link>
                  <div className="muted">
                    {video?.youtubeVideoId} · {formatClock(segment.startSeconds)}
                    {segment.endSeconds != null ? `–${formatClock(segment.endSeconds)}` : ""}
                  </div>
                  {segment.publicationStatus !== "draft" ? (
                    <form
                      action={async (formData) => {
                        await draftAction(formData);
                      }}
                    >
                      <input type="hidden" name="segmentId" value={segment.id} />
                      <button className="button secondary" type="submit">
                        Return to draft
                      </button>
                    </form>
                  ) : null}
                </div>
              );
            })}
          </article>
          <article className="panel">
            <h3>Suggestions</h3>
            {page.suggestions.length === 0 ? <p className="muted">No suggestions for this lesson.</p> : null}
            <ul>
              {page.suggestions.map((suggestion) => {
                const video = page.videoMap.get(suggestion.videoId);
                return (
                  <li key={suggestion.id}>
                    <Link href={video ? `/videos/${video.id}` : "/videos"}>{video?.title ?? "Video"}</Link>{" "}
                    <StatusPill status={suggestion.reviewStatus} />
                    <div className="muted">{Math.round(suggestion.confidence * 100)}% · {suggestion.evidenceKind}</div>
                  </li>
                );
              })}
            </ul>
          </article>
        </section>
      </div>
    </>
  );
}
