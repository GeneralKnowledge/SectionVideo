"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { approveAction, rejectAction } from "@/lib/actions/curator";
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
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
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
      {message ? <p className="ok">{message}</p> : null}
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
      <form
        className="stack"
        action={async (formData) => {
          const result = await approveAction(formData);
          setMessage(result.ok ? result.message : result.error);
          if (result.ok) router.refresh();
        }}
      >
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
          <button className="button" type="submit" data-approve="">
            Approve
          </button>
        </div>
      </form>
      <form
        action={async (formData) => {
          const result = await rejectAction(formData);
          setMessage(result.ok ? result.message : result.error);
          if (result.ok) router.refresh();
        }}
      >
        <input type="hidden" name="suggestionId" value={item.id} />
        <button className="button danger" type="submit" data-reject="">
          Reject
        </button>
      </form>
    </article>
  );
}
