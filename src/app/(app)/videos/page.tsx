import Link from "next/link";
import { Pills, StatusPill } from "@/components/pills";
import { getDb } from "@/lib/db";
import { listVideos, videoLabels } from "@/lib/services/queries";

export default async function VideosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const handle = getDb();
  const videos = listVideos(handle, q);
  return (
    <>
      <h2 className="page-title">Videos</h2>
      <form className="search" action="/videos" style={{ marginBottom: "1rem" }}>
        <input name="q" defaultValue={q} aria-label="Filter videos" placeholder="Filter by title, channel, or video ID" />
        <button type="submit">Filter</button>
      </form>
      {videos.length === 0 ? (
        <section className="panel">
          <p>No videos match. Add a YouTube URL or import a playlist.</p>
          <Link className="button" href="/videos/new">
            Add video URL
          </Link>
        </section>
      ) : (
        <section className="panel">
          <table>
            <thead>
              <tr>
                <th>Video</th>
                <th>Availability</th>
                <th>Material</th>
              </tr>
            </thead>
            <tbody>
              {videos.map((video) => (
                <tr key={video.id}>
                  <td>
                    <Link href={`/videos/${video.id}`}>{video.title}</Link>
                    <div className="muted">{video.youtubeVideoId}</div>
                  </td>
                  <td>
                    <StatusPill status={video.availabilityStatus} />
                  </td>
                  <td>
                    <Pills labels={videoLabels(handle, video.id)} />
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
