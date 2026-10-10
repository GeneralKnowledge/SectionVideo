"use client";

import { useActionState } from "react";
import { addVideoAction, type ActionResult } from "@/lib/actions/curator";

export function NewVideoForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(addVideoAction, null);
  return (
    <form action={action} className="stack">
      <label>
        YouTube URL
        <input name="url" required placeholder="https://www.youtube.com/watch?v=…" data-testid="video-url" />
      </label>
      <label>
        Title, if YouTube metadata is unavailable
        <input name="title" placeholder="Optional when oEmbed succeeds" />
      </label>
      <label>
        Channel
        <input name="channel" />
      </label>
      <label>
        Duration in seconds
        <input name="duration" inputMode="numeric" />
      </label>
      <label>
        Description or chapters
        <textarea name="description" placeholder={"0:00 Introduction\n1:20 Loose-lead walking"} />
      </label>
      {state && !state.ok ? (
        <p className="alert" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save video"}
      </button>
    </form>
  );
}
