import { NewVideoForm } from "./new-video-form";

export default function NewVideoPage() {
  return (
    <>
      <h2 className="page-title">Add a video</h2>
      <p className="lede">
        The video stays on YouTube. If oEmbed is reachable, the title and channel are filled in. If it is not, enter the title yourself and the record is kept as metadata you supplied.
      </p>
      <section className="panel">
        <NewVideoForm />
      </section>
    </>
  );
}
