"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
  type ActionState,
} from "@/server/actions";

const initial: ActionState = {};

const demoAccounts = [
  ["Alex Rivera", "alex@sunday-sheet.test", "Commissioner"],
  ["Dylan Brooks", "dylan@sunday-sheet.test", "Member"],
  ["John Patel", "john@sunday-sheet.test", "Member"],
];

export function AuthForm({
  mode,
  nextPath = "/dashboard",
  demoMode = false,
  resetNotice = false,
  token = "",
}: {
  mode: "login" | "signup" | "forgot" | "reset";
  nextPath?: string;
  demoMode?: boolean;
  resetNotice?: boolean;
  token?: string;
}) {
  const action =
    mode === "signup"
      ? signUpAction
      : mode === "forgot"
        ? forgotPasswordAction
        : mode === "reset"
          ? resetPasswordAction
          : signInAction;
  const [state, formAction, pending] = useActionState(action, initial);

  return (
    <main className="sheet-lines flex min-h-full flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
        <Logo />
        <h1 className="mt-6 text-3xl tracking-tight">
          {mode === "signup"
            ? "Create your account"
            : mode === "forgot"
              ? "Reset your password"
              : mode === "reset"
                ? "Choose a new password"
                : "Log in"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {mode === "login"
            ? "Pick a winner for each game. That's the whole week."
            : mode === "signup"
              ? "Display name, email, and a password. Nothing else."
              : "We'll get you back to the sheet."}
        </p>
        {resetNotice ? (
          <p className="mt-4 rounded-xl bg-secondary px-3 py-2 text-sm">Password updated. Log in with the new one.</p>
        ) : null}
        <form action={formAction} className="mt-6 space-y-4">
          <input type="hidden" name="next" value={nextPath} />
          {mode === "reset" ? <input type="hidden" name="token" value={token} /> : null}
          {mode === "signup" ? (
            <Field label="Display name" name="displayName" autoComplete="nickname" />
          ) : null}
          {mode !== "reset" ? (
            <Field label="Email" name="email" type="email" autoComplete="email" />
          ) : null}
          {mode !== "forgot" ? (
            <Field
              label="Password"
              name="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          ) : null}
          {mode === "signup" || mode === "reset" ? (
            <Field
              label="Confirm password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
            />
          ) : null}
          {state.error ? (
            <p className="text-sm text-destructive" role="alert">
              {state.error}
            </p>
          ) : null}
          {state.message ? <p className="text-sm text-foreground">{state.message}</p> : null}
          {state.demoResetUrl ? (
            <p className="break-all text-sm">
              <Link className="underline" href={state.demoResetUrl}>
                {state.demoResetUrl}
              </Link>
            </p>
          ) : null}
          <Button type="submit" className="h-11 w-full text-base" disabled={pending}>
            {pending
              ? "Working…"
              : mode === "signup"
                ? "Create account"
                : mode === "forgot"
                  ? "Send reset link"
                  : mode === "reset"
                    ? "Update password"
                    : "Log in"}
          </Button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              New here?{" "}
              <Link className="text-foreground underline" href={`/signup?next=${encodeURIComponent(nextPath)}`}>
                Create an account
              </Link>
              {" · "}
              <Link className="text-foreground underline" href="/forgot-password">
                Forgot password
              </Link>
            </>
          ) : (
            <Link className="text-foreground underline" href="/login">
              Back to log in
            </Link>
          )}
        </p>
        {demoMode && mode === "login" ? (
          <div className="mt-6 border-t pt-4">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Demo accounts · password pickem-demo
            </p>
            <div className="mt-3 grid gap-2">
              {demoAccounts.map(([name, email, role]) => (
                <DemoAccountButton
                  key={email}
                  name={name}
                  email={email}
                  role={role}
                  nextPath={nextPath}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function DemoAccountButton({
  name,
  email,
  role,
  nextPath,
}: {
  name: string;
  email: string;
  role: string;
  nextPath: string;
}) {
  const [state, action, pending] = useActionState(signInAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="password" value="pickem-demo" />
      <input type="hidden" name="next" value={nextPath} />
      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm hover:bg-secondary disabled:opacity-60"
      >
        <span>{name}</span>
        <span className="text-muted-foreground">{role}</span>
      </button>
      {state.error ? (
        <p className="mt-1 text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  autoComplete,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} autoComplete={autoComplete} required className="h-11" />
    </div>
  );
}
