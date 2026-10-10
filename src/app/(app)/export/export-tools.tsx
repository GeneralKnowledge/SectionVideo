"use client";

import { useActionState } from "react";
import { validateExportAction, type ActionResult } from "@/lib/actions/curator";

export function ExportTools() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(validateExportAction, null);
  return (
    <form action={action} className="stack">
      <label>
        Check a file against schema version 1
        <input name="exportFile" type="file" accept="application/json,.json" />
      </label>
      <label>
        Or paste JSON
        <textarea name="exportJson" />
      </label>
      {state ? <p className={state.ok ? "ok" : "alert"}>{state.ok ? state.message : state.error}</p> : null}
      <button className="button secondary" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Validate"}
      </button>
    </form>
  );
}
