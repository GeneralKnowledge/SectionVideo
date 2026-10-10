import Link from "next/link";
import { notFound } from "next/navigation";
import { Pills, StatusPill } from "@/components/pills";
import { getDb } from "@/lib/db";
import { getPlaylist, videoLabels } from "@/lib/services/queries";
import { formatClock, formatWhen } from "@/lib/timestamps";

export default async function PlaylistDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const page = getPlaylist(getDb(), id);
  if (!page) notFound();
  const handle = getDb();
  return (
    <>
      <p className="muted">Playlist</p>
      <h2 className="page-title">{page.playlist.title}</h2>
      <p className="lede">{page.playlist.description || "No description stored."}</p>
      <div className="pills">
        <StatusPill status={page.playlist.importStatus} />
        <span className="pill">{page.playlist.source.replaceAll("_", " ")}</span>
        {page.playlist.isFixture ? <span className="pill warn">Fixture — not a live YouTube import</span> : null}
      </div>
      <p className="muted">
        YouTube id {page.playlist.youtubePlaylistId}
        {page.playlist.lastImportedAt ? ` · last imported ${formatWhen(page.playlist.lastImportedAt)}` : ""}
      </p>
      {page.playlist.errorDetails ? <p className="note">{page.playlist.errorDetails}</p> : null}
      {page.entries.length === 0 ? (
        <section className="panel">
          <p>This import did not store any videos.</p>
        </section>
      ) : (
        <section className="panel">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Video</th>
                <th>Status</th>
                <th>Source material</th>
              </tr>
            </thead>
            <tbody>
              {page.entries.map((entry) => (
                <tr key={entry.video.id}>
                  <td>{entry.position + 1}</td>
                  <td>
                    <Link href={`/videos/${entry.video.id}`} data-testid={`video-link-${entry.video.youtubeVideoId}`}>
                      {entry.video.title}
                    </Link>
                    <div className="muted">
                      {entry.video.channelName || "Channel unknown"}
                      {entry.video.durationSeconds != null ? ` · ${formatClock(entry.video.durationSeconds)}` : ""}
                    </div>
                  </td>
                  <td>
                    <StatusPill status={entry.video.availabilityStatus} />
                    {entry.unavailableReason ? <div className="muted">{entry.unavailableReason}</div> : null}
                  </td>
                  <td>
                    <Pills labels={videoLabels(handle, entry.video.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
