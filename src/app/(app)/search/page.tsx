import Link from "next/link";
import { getDb } from "@/lib/db";
import { searchLibrary } from "@/lib/services/queries";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const results = q.trim() ? searchLibrary(getDb(), q) : { videos: [], lessons: [] };
  return (
    <>
      <h2 className="page-title">Search</h2>
      {!q.trim() ? <p className="lede">Search videos, lessons, and technique names.</p> : null}
      {q.trim() ? (
        <div className="two">
          <section className="panel">
            <h3>Videos</h3>
            {results.videos.length === 0 ? <p className="muted">No videos.</p> : null}
            <ul>
              {results.videos.map((video) => (
                <li key={video.id}>
                  <Link href={`/videos/${video.id}`}>{video.title}</Link>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel">
            <h3>Lessons</h3>
            {results.lessons.length === 0 ? <p className="muted">No lessons.</p> : null}
            <ul>
              {results.lessons.map((lesson) => (
                <li key={lesson.id}>
                  <Link href={`/lessons/${lesson.lessonId}`}>{lesson.title}</Link>
                  <div className="muted">{lesson.lessonId}</div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : null}
    </>
  );
}
