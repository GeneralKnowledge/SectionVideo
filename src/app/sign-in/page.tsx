import { SignInForm } from "./sign-in-form";

export default function SignInPage() {
  return (
    <main className="sign-in">
      <section className="card sign-card stack">
        <p className="mark" style={{ color: "var(--brand-deep)" }}>
          Good Dog
        </p>
        <h1>Video Curator</h1>
        <p className="lede">
          A private desk for matching YouTube demonstrations to Good Dog lessons. Suggestions stay drafts until you approve them.
        </p>
        <SignInForm />
      </section>
    </main>
  );
}
