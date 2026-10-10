import Link from "next/link";
import { StatusPill } from "@/components/pills";
import { getDb } from "@/lib/db";
import { getOverview } from "@/lib/services/queries";
import { formatWhen } from "@/lib/timestamps";

export default function OverviewPage() {
  const overview = getOverview(getDb());
  const stats = [
    ["Playlists", overview.playlists],
    ["Videos", overview.videos],
    ["Transcripts", overview.transcripts],
    ["Awaiting review", overview.awaitingReview],
    ["Approved", overview.approved],
    ["Failed imports", overview.failedImports],
    ["Stale matches", overview.stale],
    ["Partial imports", overview.partialPlaylists],
  ];
  return (
    <>
      <h2 className="page-title">Overview</h2>
      <p className="lede">
        Import a playlist or a single video, attach a transcript or chapters, then approve only the segments you want Good Dog to receive.
      </p>
      <div className="grid">
        {stats.map(([label, value]) => (
          <article key={String(label)} className="stat">
            <b>{value}</b>
            <span>{label}</span>
          </article>
        ))}
      </div>
      <div className="two" style={{ marginTop: "1rem" }}>
        <section className="panel">
          <h3>Playlists</h3>
          {overview.recentPlaylists.length === 0 ? (
            <p className="muted">No playlists yet. Import the labelled fixture, or add a video URL.</p>
          ) : (
            <table>
              <tbody>
                {overview.recentPlaylists.map((playlist) => (
                  <tr key={playlist.id}>
                    <td>
                      <Link href={`/playlists/${playlist.id}`}>{playlist.title}</Link>
                      {playlist.isFixture ? <span className="pill warn">Fixture</span> : null}
                    </td>
                    <td>
                      <StatusPill status={playlist.importStatus} />
                    </td>
                    <td className="muted">{playlist.lastImportedAt ? formatWhen(playlist.lastImportedAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p>
            <Link href="/playlists/import">Import a playlist</Link>
          </p>
        </section>
        <section className="panel">
          <h3>Recent videos</h3>
          {overview.recentVideos.length === 0 ? (
            <p className="muted">Videos you add will appear here, including ones that are not in a playlist.</p>
          ) : (
            <ul>
              {overview.recentVideos.map((video) => (
                <li key={video.id}>
                  <Link href={`/videos/${video.id}`}>{video.title}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
