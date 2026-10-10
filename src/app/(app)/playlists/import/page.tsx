import { ImportForms } from "./import-forms";

export default function ImportPage() {
  return (
    <>
      <h2 className="page-title">Import a playlist</h2>
      <p className="lede">
        Re-importing the same playlist updates metadata and order without duplicating videos or deleting transcripts and approvals.
      </p>
      <ImportForms apiConfigured={Boolean(process.env.YOUTUBE_API_KEY)} />
    </>
  );
}
