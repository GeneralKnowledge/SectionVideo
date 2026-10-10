import Link from "next/link";
import { StatusPill } from "@/components/pills";
import { getDb } from "@/lib/db";
import { listPlaylists } from "@/lib/services/queries";
import { formatWhen } from "@/lib/timestamps";

export default function PlaylistsPage() {
  const playlists = listPlaylists(getDb());
  return (
    <>
      <h2 className="page-title">Playlist library</h2>
      <p className="lede">
        Playlist order is kept. A video can belong to more than one playlist without duplicating its record.
      </p>
      <p>
        <Link className="button" href="/playlists/import">
          Import playlist
        </Link>
      </p>
      {playlists.length === 0 ? (
        <section className="panel">
          <p>No playlists yet. You can still add individual video URLs from Videos.</p>
        </section>
      ) : (
        <section className="panel">
          <table>
            <thead>
              <tr>
                <th>Playlist</th>
                <th>Videos</th>
                <th>Status</th>
                <th>Imported</th>
              </tr>
            </thead>
            <tbody>
              {playlists.map((playlist) => (
                <tr key={playlist.id}>
                  <td>
                    <Link href={`/playlists/${playlist.id}`}>{playlist.title}</Link>
                    <div className="muted">{playlist.youtubePlaylistId}</div>
                    {playlist.isFixture ? <span className="pill warn">Fixture — not a YouTube import</span> : null}
                  </td>
                  <td>{playlist.itemCount}</td>
                  <td>
                    <StatusPill status={playlist.importStatus} />
                  </td>
                  <td className="muted">{playlist.lastImportedAt ? formatWhen(playlist.lastImportedAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
