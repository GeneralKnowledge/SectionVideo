import { ExportTools } from "./export-tools";
import { getDb } from "@/lib/db";
import { buildExport } from "@/lib/services/export-document";

export default function ExportPage() {
  const document = buildExport(getDb());
  const json = JSON.stringify(document, null, 2);
  return (
    <>
      <h2 className="page-title">Export</h2>
      <p className="lede">
        Only approved and published segments are included. Good Dog should match lessonId to an exercise id or a guide lesson id, and skip records marked fixture.
      </p>
      <div className="row-actions">
        <a className="button" href="/api/export">
          Download JSON
        </a>
      </div>
      <p className="muted">Import instructions for Good Dog are in docs/integration.md.</p>
      {document.warnings.length > 0 ? (
        <div className="note" style={{ marginTop: "1rem" }}>
          {document.warnings.map((warning) => (
            <p key={`${warning.code}-${warning.videoId}-${warning.lessonId}`}>{warning.message}</p>
          ))}
        </div>
      ) : null}
      <pre className="export" data-testid="export-json">
        {json}
      </pre>
      <section className="panel" style={{ marginTop: "1rem" }}>
        <ExportTools />
      </section>
    </>
  );
}
