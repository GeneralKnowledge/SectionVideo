"use client";

import { useActionState } from "react";
import {
  importFixtureAction,
  importMetadataAction,
  importPlaylistAction,
  type ActionResult,
} from "@/lib/actions/curator";

export function ImportForms({ apiConfigured }: { apiConfigured: boolean }) {
  const [playlistState, playlistAction, playlistPending] = useActionState<ActionResult | null, FormData>(
    importPlaylistAction,
    null,
  );
  const [metadataState, metadataAction, metadataPending] = useActionState<ActionResult | null, FormData>(
    importMetadataAction,
    null,
  );
  return (
    <div className="stack">
      <section className="panel stack">
        <h3>YouTube playlist URL</h3>
        <p className="muted">
          {apiConfigured
            ? "The server will read playlist pages with the YouTube Data API and keep the original order."
            : "No API key is configured, so this form cannot contact YouTube. Use a metadata file, a single video URL, or the labelled fixture."}
        </p>
        <form action={playlistAction} className="stack">
          <label>
            Playlist URL
            <input name="playlistUrl" placeholder="https://www.youtube.com/playlist?list=…" required />
          </label>
          {playlistState && !playlistState.ok ? (
            <p className="alert" role="alert">
              {playlistState.error}
            </p>
          ) : null}
          <button className="button" disabled={playlistPending} type="submit">
            {playlistPending ? "Importing…" : "Import playlist"}
          </button>
        </form>
      </section>
      <section className="panel stack">
        <h3>Metadata file</h3>
        <p className="muted">
          This reads a JSON file you supply. It does not contact YouTube. Mark unavailable videos explicitly.
        </p>
        <form action={metadataAction} className="stack">
          <label>
            JSON file
            <input name="metadata" type="file" accept="application/json,.json" />
          </label>
          {metadataState && !metadataState.ok ? (
            <p className="alert" role="alert">
              {metadataState.error}
            </p>
          ) : null}
          <button className="button secondary" disabled={metadataPending} type="submit">
            {metadataPending ? "Reading file…" : "Import metadata file"}
          </button>
        </form>
      </section>
      <section className="panel stack">
        <h3>Development fixture</h3>
        <p className="muted">
          Sample videos with invented IDs. They are labelled fixture data and were not fetched from the candidate playlists.
        </p>
        <form action={importFixtureAction}>
          <button className="button secondary" type="submit" data-testid="import-fixture">
            Import development fixture
          </button>
        </form>
      </section>
    </div>
  );
}
