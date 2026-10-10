import Link from "next/link";
import { getDb } from "@/lib/db";
import { listLessons } from "@/lib/services/queries";

export default async function LessonsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const lessons = listLessons(getDb(), q);
  return (
    <>
      <h2 className="page-title">Lesson catalogue</h2>
      <p className="lede">
        Exercise IDs such as ex-lead-loose are the practical lessons stored by Good Dog. Guide IDs such as lesson-reactive-management come from the knowledge-base guides.
      </p>
      <form className="search" action="/lessons">
        <input name="q" defaultValue={q} aria-label="Search lessons" placeholder="Search title, ID, or objective" />
        <button type="submit">Search</button>
      </form>
      <section className="panel" style={{ marginTop: "1rem" }}>
        <table>
          <thead>
            <tr>
              <th>Lesson</th>
              <th>Kind</th>
              <th>Objective</th>
            </tr>
          </thead>
          <tbody>
            {lessons.map((lesson) => (
              <tr key={lesson.id}>
                <td>
                  <Link href={`/lessons/${lesson.lessonId}`}>{lesson.title}</Link>
                  <div className="muted">{lesson.lessonId}</div>
                  {lesson.removedAt ? <span className="pill warn">Removed from latest sync</span> : null}
                </td>
                <td>{lesson.lessonKind}</td>
                <td className="muted">{lesson.learningObjectiveLabel ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
