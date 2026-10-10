"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addChapterAction,
  approveAction,
  manualMapAction,
  rejectAction,
  saveTranscriptAction,
  suggestAction,
  type ActionResult,
} from "@/lib/actions/curator";
import { SAFETY_FLAG_LABELS, type SafetyFlag } from "@/lib/matching/welfare";
import { buildEmbedUrl, canonicalWatchUrl } from "@/lib/youtube/embed";
import { formatClock } from "@/lib/timestamps";

type LessonOption = {
  id: string;
  lessonId: string;
  lessonKind: string;
  title: string;
  objective: string | null;
};

type SuggestionView = {
  id: string;
  lessonId: string;
  lessonTitle: string;
  startSeconds: number | null;
  endSeconds: number | null;
  timingGrounded: boolean;
  evidenceKind: string;
  evidenceText: string;
  explanation: string;
  confidence: number;
  stageMismatch: string | null;
  prerequisiteNote: string | null;
  safetyFlags: SafetyFlag[];
  provider: string;
  reviewStatus: string;
  stale: boolean;
};

type Cue = { id: string; startMs: number; endMs: number; text: string };
type Chapter = { id: string; title: string; startSeconds: number; endSeconds: number | null; source: string };

export function VideoStudio({
  video,
  labels,
  chapters,
  cues,
  transcriptNote,
  suggestions,
  lessons,
}: {
  video: {
    id: string;
    youtubeVideoId: string;
    title: string;
    description: string;
    channelName: string;
    channelUrl: string | null;
    durationSeconds: number | null;
    availabilityStatus: string;
    embedStatus: string;
    isFixture: boolean;
    retrievalError: string | null;
  };
  labels: string[];
  chapters: Chapter[];
  cues: Cue[];
  transcriptNote: string | null;
  suggestions: SuggestionView[];
  lessons: LessonOption[];
}) {
  const router = useRouter();
  const initial = suggestions.find((item) => item.timingGrounded) ?? suggestions[0];
  const [start, setStart] = useState(initial?.startSeconds ?? 0);
  const [end, setEnd] = useState<number | "">(initial?.endSeconds ?? "");
  const [notice, setNotice] = useState<ActionResult | null>(null);
  const [lessonQuery, setLessonQuery] = useState("");

  useEffect(() => {
    if (initial?.startSeconds != null) setStart(initial.startSeconds);
    if (initial?.endSeconds != null) setEnd(initial.endSeconds);
  }, [initial?.id, initial?.startSeconds, initial?.endSeconds]);
  const filteredLessons = useMemo(() => {
    const needle = lessonQuery.trim().toLowerCase();
    return lessons
      .filter((lesson) => {
        if (!needle) return true;
        return (
          lesson.title.toLowerCase().includes(needle) ||
          lesson.lessonId.toLowerCase().includes(needle) ||
          (lesson.objective ?? "").toLowerCase().includes(needle)
        );
      })
      .slice(0, 12);
  }, [lessonQuery, lessons]);

  const endSeconds = end === "" ? null : end;
  const canEmbed =
    video.embedStatus !== "blocked" &&
    (video.availabilityStatus === "available" || video.availabilityStatus === "unknown");
  const embedSrc = canEmbed
    ? buildEmbedUrl({
        videoId: video.youtubeVideoId,
        startSeconds: start,
        endSeconds,
        privacyEnhanced: true,
      })
    : null;
  const watchUrl = canonicalWatchUrl(video.youtubeVideoId, start);

  async function run(result: Promise<ActionResult>) {
    const next = await result;
    setNotice(next);
    if (next.ok) router.refresh();
  }

  return (
    <div className="stack">
      <div className="pills">
        {labels.map((label) => (
          <span key={label} className={`pill ${label === "Extraction failed" ? "bad" : label === "Manual review required" ? "warn" : "good"}`}>
            {label}
          </span>
        ))}
        {video.isFixture ? <span className="pill warn">Fixture</span> : null}
      </div>
      {video.isFixture ? (
        <p className="note">This is labelled fixture data. The player URL is well formed, but the video ID is not a real YouTube video.</p>
      ) : null}
      {video.retrievalError ? <p className="note">{video.retrievalError}</p> : null}
      {notice ? <p className={notice.ok ? "ok" : "alert"}>{notice.ok ? notice.message : notice.error}</p> : null}
      <div className="studio">
        <div className="stack">
          <div className="player">
            {embedSrc ? (
              <iframe
                data-testid="embed-frame"
                src={embedSrc}
                title={video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            ) : (
              <a className="fallback" href={watchUrl}>
                This video cannot be embedded. Open it on YouTube.
              </a>
            )}
          </div>
          <p className="muted">
            The player is asked to start at the selected time and, when an end time is set, to stop near it. YouTube does not guarantee the stop will land on that exact frame.
          </p>
          <p className="muted">
            Privacy-enhanced mode uses youtube-nocookie.com. Playback can still send data to YouTube once the video plays.
          </p>
          <p>
            {video.channelName || "Original channel"} ·{" "}
            <a href={watchUrl}>Open the original video at this time</a>
            {video.channelUrl ? (
              <>
                {" "}
                · <a href={video.channelUrl}>Channel</a>
              </>
            ) : null}
          </p>
          <section className="panel stack">
            <h3>Manual lesson mapping</h3>
            <form
              className="stack"
              action={async (formData) => {
                await run(manualMapAction(null, formData));
              }}
            >
              <input type="hidden" name="videoId" value={video.id} />
              <label>
                Find a Good Dog lesson
                <input value={lessonQuery} onChange={(event) => setLessonQuery(event.target.value)} placeholder="Loose lead, recall, sit…" />
              </label>
              <label>
                Lesson
                <select name="lessonReferenceId" required defaultValue={filteredLessons[0]?.id ?? ""}>
                  {filteredLessons.map((lesson) => (
                    <option key={lesson.id} value={lesson.id}>
                      {lesson.title} ({lesson.lessonId})
                    </option>
                  ))}
                </select>
              </label>
              <div className="row-actions">
                <label>
                  Start seconds
                  <input name="start" inputMode="numeric" required value={start} onChange={(event) => setStart(Number(event.target.value || 0))} />
                </label>
                <label>
                  End seconds
                  <input
                    name="end"
                    inputMode="numeric"
                    value={end}
                    onChange={(event) => setEnd(event.target.value === "" ? "" : Number(event.target.value))}
                  />
                </label>
              </div>
              <label>
                Curator note
                <textarea name="note" placeholder="What should the viewer watch for?" />
              </label>
              <button className="button" type="submit">
                Add manual mapping
              </button>
            </form>
          </section>
        </div>
        <div className="stack">
          <section className="panel">
            <h3>Chapters</h3>
            {chapters.length === 0 ? <p className="muted">No chapters yet. Add one, or paste a description that lists timestamps.</p> : null}
            {chapters.map((chapter) => (
              <button
                key={chapter.id}
                className="chapter-row"
                type="button"
                onClick={() => {
                  setStart(chapter.startSeconds);
                  setEnd(chapter.endSeconds ?? "");
                }}
              >
                <span className="time">{formatClock(chapter.startSeconds)}</span>
                <span>
                  {chapter.title}
                  <span className="muted"> · {chapter.source}</span>
                </span>
              </button>
            ))}
            <form
              className="stack"
              action={async (formData) => {
                await run(addChapterAction(null, formData));
              }}
            >
              <input type="hidden" name="videoId" value={video.id} />
              <label>
                Chapter title
                <input name="title" />
              </label>
              <label>
                Start seconds
                <input name="start" inputMode="numeric" />
              </label>
              <button className="button secondary" type="submit">
                Add chapter
              </button>
            </form>
          </section>
          <section className="panel">
            <h3>Transcript</h3>
            {transcriptNote ? <p className="muted">{transcriptNote}</p> : <p className="muted">No transcript stored. Chapters and the description can still be used.</p>}
            {cues.length === 0 ? <p className="muted">Nothing to read yet.</p> : null}
            <div>
              {cues.map((cue) => (
                <button
                  key={cue.id}
                  className="cue"
                  type="button"
                  onClick={() => {
                    setStart(Math.floor(cue.startMs / 1000));
                    setEnd(Math.ceil(cue.endMs / 1000));
                  }}
                >
                  <span className="time">{formatClock(Math.floor(cue.startMs / 1000))}</span>
                  <span>{cue.text}</span>
                </button>
              ))}
            </div>
            <form
              className="stack"
              action={async (formData) => {
                await run(saveTranscriptAction(null, formData));
              }}
            >
              <input type="hidden" name="videoId" value={video.id} />
              <label>
                VTT or SRT file
                <input name="file" type="file" accept=".vtt,.srt,text/vtt,application/x-subrip" data-testid="transcript-file" />
              </label>
              <label>
                Or paste cues
                <textarea name="transcript" data-testid="transcript-text" placeholder="WEBVTT" />
              </label>
              <button className="button secondary" type="submit">
                Save transcript
              </button>
            </form>
          </section>
        </div>
      </div>
      <section className="panel stack">
        <div className="row-actions">
          <h3 style={{ margin: 0 }}>Suggested lessons</h3>
          <button
            className="button"
            type="button"
            data-testid="suggest-matches"
            onClick={() => run(suggestAction(video.id))}
          >
            Suggest matches
          </button>
        </div>
        <p className="muted">Approval is always a human action. Model output is discarded when the timestamps or lesson IDs do not match stored evidence.</p>
        {suggestions.length === 0 ? <p>No suggestions yet.</p> : null}
        {suggestions.map((suggestion) => (
          <article key={suggestion.id} className="card suggestion" data-testid={`suggestion-${suggestion.lessonId}`}>
            <header>
              <strong>{suggestion.lessonTitle}</strong>{" "}
              <span className="pill">{suggestion.lessonId}</span>{" "}
              <span className="pill">{suggestion.reviewStatus}</span>{" "}
              <span className="pill">{Math.round(suggestion.confidence * 100)}%</span>
              {suggestion.stale ? <span className="pill warn">Stale curriculum</span> : null}
            </header>
            <p className="muted">
              {suggestion.provider} · {suggestion.evidenceKind}
              {suggestion.timingGrounded ? "" : " · timestamp not grounded yet"}
            </p>
            <blockquote className="quote">{suggestion.evidenceText}</blockquote>
            <p>{suggestion.explanation}</p>
            {suggestion.prerequisiteNote ? <p className="muted">{suggestion.prerequisiteNote}</p> : null}
            {suggestion.stageMismatch ? <p className="note">{suggestion.stageMismatch}</p> : null}
            {suggestion.safetyFlags.length > 0 ? (
              <p className="note">
                Review flags, not a verdict:{" "}
                {suggestion.safetyFlags.map((flag) => SAFETY_FLAG_LABELS[flag] ?? flag).join("; ")}
              </p>
            ) : null}
            <form
              className="stack"
              action={async (formData) => {
                await run(approveAction(formData));
              }}
            >
              <input type="hidden" name="suggestionId" value={suggestion.id} />
              <label>
                Display title
                <input name="title" defaultValue={suggestion.lessonTitle} />
              </label>
              <div className="row-actions">
                <label>
                  Start seconds
                  <input
                    name="start"
                    data-testid="start-seconds"
                    inputMode="numeric"
                    defaultValue={suggestion.startSeconds ?? start}
                    onChange={(event) => setStart(Number(event.target.value || 0))}
                  />
                </label>
                <label>
                  End seconds
                  <input
                    name="end"
                    data-testid="end-seconds"
                    inputMode="numeric"
                    defaultValue={suggestion.endSeconds ?? ""}
                    onChange={(event) => setEnd(event.target.value === "" ? "" : Number(event.target.value))}
                  />
                </label>
              </div>
              <label>
                Viewing instructions
                <textarea
                  name="instructions"
                  defaultValue="Observe the handler’s timing and how the reward follows the behaviour."
                />
              </label>
              <label>
                Curator notes
                <textarea name="notes" />
              </label>
              <div className="row-actions">
                <button className="button" type="submit" data-testid="approve-suggestion">
                  Approve
                </button>
              </div>
            </form>
            <form action={async (formData) => run(rejectAction(formData))}>
              <input type="hidden" name="suggestionId" value={suggestion.id} />
              <button className="button danger" type="submit">
                Reject
              </button>
            </form>
          </article>
        ))}
      </section>
      {video.description ? (
        <section className="panel">
          <h3>Description</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{video.description}</p>
        </section>
      ) : null}
    </div>
  );
}
