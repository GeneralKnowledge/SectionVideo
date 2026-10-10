"use client";

import { useActionState } from "react";
import { signInAction, type ActionResult } from "@/lib/actions/curator";

export function SignInForm() {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(signInAction, null);
  return (
    <form action={action} className="stack">
      <label>
        Email
        <input name="email" type="email" autoComplete="username" required data-testid="email" />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required data-testid="password" />
      </label>
      {state && !state.ok ? (
        <p className="alert" role="alert">
          {state.error}
        </p>
      ) : null}
      <button className="button" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
