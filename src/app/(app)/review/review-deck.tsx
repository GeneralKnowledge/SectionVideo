"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useActionState } from "react";
import { approveFormAction, rejectFormAction } from "@/lib/actions/curator";
import { SAFETY_FLAG_LABELS, type SafetyFlag } from "@/lib/matching/welfare";

type Item = {
  id: string;
  videoHref: string;
  videoTitle: string;
  youtubeVideoId: string;
  lessonTitle: string;
  lessonId: string;
  confidence: number;
  evidenceText: string;
  explanation: string;
  startSeconds: number | null;
  endSeconds: number | null;
  safetyFlags: SafetyFlag[];
  stageMismatch: string | null;
  prerequisiteNote: string | null;
  stale: boolean;
};

export function ReviewDeck({ items }: { items: Item[] }) {
  const [index, setIndex] = useState(0);
  const item = items[index];

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (event.key === "j") setIndex((value) => Math.min(items.length - 1, value + 1));
      if (event.key === "k") setIndex((value) => Math.max(0, value - 1));
      if (event.key === "a") {
        document.querySelector<HTMLButtonElement>("[data-approve]")?.click();
      }
      if (event.key === "r") {
        document.querySelector<HTMLButtonElement>("[data-reject]")?.click();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);

  if (!item) return <p>The queue is clear.</p>;

  return (
    <article className="panel stack">
      <p className="muted">
        {index + 1} of {items.length}. Keys: j next, k previous, a approve, r reject. Shortcuts pause while you are typing.
      </p>
      <h3>
        {item.lessonTitle} <span className="pill">{item.lessonId}</span>
      </h3>
      <p>
        <Link href={item.videoHref}>{item.videoTitle}</Link>
        <span className="muted"> · {item.youtubeVideoId}</span>
        <span className="pill">{Math.round(item.confidence * 100)}%</span>
        {item.stale ? <span className="pill warn">Stale</span> : null}
      </p>
      <blockquote className="quote">{item.evidenceText}</blockquote>
      <p>{item.explanation}</p>
      {item.prerequisiteNote ? <p className="muted">{item.prerequisiteNote}</p> : null}
      {item.stageMismatch ? <p className="note">{item.stageMismatch}</p> : null}
      {item.safetyFlags.length > 0 ? (
        <p className="note">
          Review flags, not a verdict: {item.safetyFlags.map((flag) => SAFETY_FLAG_LABELS[flag] ?? flag).join("; ")}
        </p>
      ) : null}
      <ReviewActions item={item} />
    </article>
  );
}

function ReviewActions({ item }: { item: Item }) {
  const [approveState, approve, approvePending] = useActionState(approveFormAction, null);
  const [rejectState, reject, rejectPending] = useActionState(rejectFormAction, null);
  const message = approveState?.ok
    ? approveState.message
    : rejectState?.ok
      ? rejectState.message
      : approveState && !approveState.ok
        ? approveState.error
        : rejectState && !rejectState.ok
          ? rejectState.error
          : null;
  return (
    <>
      {message ? <p className={approveState?.ok || rejectState?.ok ? "ok" : "alert"}>{message}</p> : null}
      <form className="stack" action={approve}>
        <input type="hidden" name="suggestionId" value={item.id} />
        <label>
          Display title
          <input name="title" defaultValue={item.lessonTitle} />
        </label>
        <div className="row-actions">
          <label>
            Start seconds
            <input name="start" defaultValue={item.startSeconds ?? 0} />
          </label>
          <label>
            End seconds
            <input name="end" defaultValue={item.endSeconds ?? ""} />
          </label>
        </div>
        <label>
          Viewing instructions
          <textarea name="instructions" defaultValue="Observe the timing of the reward." />
        </label>
        <label>
          Notes
          <textarea name="notes" />
        </label>
        <div className="row-actions">
          <button className="button" type="submit" data-approve="" disabled={approvePending}>
            {approvePending ? "Approving…" : "Approve"}
          </button>
        </div>
      </form>
      <form action={reject}>
        <input type="hidden" name="suggestionId" value={item.id} />
        <button className="button danger" type="submit" data-reject="" disabled={rejectPending}>
          {rejectPending ? "Rejecting…" : "Reject"}
        </button>
      </form>
    </>
  );
}
