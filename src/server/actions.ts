"use server";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { unstable_rethrow } from "next/navigation";
import { isDemoMode } from "@/lib/config";
import { getService, getStore } from "@/lib/db";
import { resetDemoDatabase } from "@/lib/db/demo-store";
import { DEMO_SESSION_COOKIE, getCurrentProfile, hashToken } from "@/lib/auth/current";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { AppError, errorMessage } from "@/lib/domain/errors";
import {
  normalizeEmail,
  validateDisplayName,
  validateRegistration,
} from "@/lib/domain/format";
import type { GameStatus } from "@/lib/domain/types";
import { revalidatePath } from "next/cache";

export type ActionState = {
  error?: string;
  message?: string;
  demoResetUrl?: string;
};

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 30,
};

async function appOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:43123";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

function refreshLeague(leagueId: string) {
  revalidatePath(`/league/${leagueId}`, "layout");
  revalidatePath("/dashboard");
}

async function requireUser() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  return profile;
}

function caught(error: unknown): ActionState {
  unstable_rethrow(error);
  if (error instanceof AppError) return { error: error.message };
  return { error: errorMessage(error) };
}

function formFromAction(prevOrForm: ActionState | FormData, formData?: FormData): FormData {
  if (typeof FormData !== "undefined" && prevOrForm instanceof FormData) return prevOrForm;
  if (formData) return formData;
  return new FormData();
}

export async function signInAction(
  prevOrForm: ActionState | FormData,
  formData?: FormData,
): Promise<ActionState> {
  const submitted = formFromAction(prevOrForm, formData);
  const email = normalizeEmail(String(submitted.get("email") ?? ""));
  const password = String(submitted.get("password") ?? "");
  const next = String(submitted.get("next") ?? "/dashboard");
  const destination = next.startsWith("/") ? next : "/dashboard";
  try {
    if (isDemoMode()) {
      const store = await getStore();
      const profile = await store.getProfileByEmail(email);
      const hash = profile ? await store.getPasswordHash?.(profile.id) : null;
      if (!profile || !hash || !(await verifyPassword(password, hash))) {
        return { error: "Email or password is incorrect." };
      }
      const token = randomBytes(32).toString("hex");
      await store.createSession?.({
        id: crypto.randomUUID(),
        userId: profile.id,
        tokenHash: hashToken(token),
        createdAt: new Date().toISOString(),
      });
      (await cookies()).set(DEMO_SESSION_COOKIE, token, cookieOptions);
      redirect(destination);
    }
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: "Email or password is incorrect." };
    redirect(destination);
  } catch (error) {
    return caught(error);
  }
}

export async function signUpAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const displayName = String(formData.get("displayName") ?? "");
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");
  const issue = validateRegistration({ displayName, email, password, confirmPassword });
  if (issue) return { error: issue };
  try {
    if (isDemoMode()) {
      const store = await getStore();
      const existing = await store.getProfileByEmail(email);
      if (existing) return { error: "An account with that email already exists." };
      const profile = {
        id: crypto.randomUUID(),
        displayName: displayName.trim(),
        email,
        avatarUrl: null,
        createdAt: new Date().toISOString(),
      };
      await store.insertProfile(profile);
      await store.setPasswordHash?.(profile.id, await hashPassword(password));
      const token = randomBytes(32).toString("hex");
      await store.createSession?.({
        id: crypto.randomUUID(),
        userId: profile.id,
        tokenHash: hashToken(token),
        createdAt: new Date().toISOString(),
      });
      (await cookies()).set(DEMO_SESSION_COOKIE, token, cookieOptions);
      redirect(next.startsWith("/") ? next : "/dashboard");
    }
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const origin = await appOrigin();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName.trim() },
        emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
      },
    });
    if (error) return { error: error.message };
    if (!data.session) {
      return {
        message: "Check your email to confirm the account, then log in.",
      };
    }
    redirect(next.startsWith("/") ? next : "/dashboard");
  } catch (error) {
    return caught(error);
  }
}

export async function signOutAction() {
  if (isDemoMode()) {
    const token = (await cookies()).get(DEMO_SESSION_COOKIE)?.value;
    if (token) {
      const store = await getStore();
      const session = await store.getSessionByTokenHash?.(hashToken(token));
      if (session) await store.deleteSessionsForUser?.(session.userId);
    }
    (await cookies()).delete(DEMO_SESSION_COOKIE);
  } else {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}

export async function forgotPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  if (!email.includes("@")) return { error: "Enter a valid email address." };
  try {
    if (isDemoMode()) {
      const store = await getStore();
      const profile = await store.getProfileByEmail(email);
      if (!profile) {
        return { message: "If an account exists for that email, a reset link is ready." };
      }
      const token = randomBytes(32).toString("hex");
      await store.saveResetToken?.({
        tokenHash: hashToken(token),
        userId: profile.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      });
      return {
        message: "Demo mode does not send email. Use this reset link within an hour.",
        demoResetUrl: `${await appOrigin()}/reset-password?token=${token}`,
      };
    }
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const origin = await appOrigin();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });
    if (error) return { error: error.message };
    return { message: "If an account exists for that email, a reset link is on the way." };
  } catch (error) {
    return caught(error);
  }
}

export async function resetPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const token = String(formData.get("token") ?? "");
  if (password.length < 8) return { error: "Password must be at least 8 characters." };
  if (password !== confirmPassword) return { error: "Password and confirm password must match." };
  try {
    if (isDemoMode()) {
      if (!token) return { error: "This reset link is invalid or expired." };
      const store = await getStore();
      const record = await store.getResetToken?.(hashToken(token));
      if (!record || new Date(record.expiresAt).getTime() < Date.now()) {
        return { error: "This reset link is invalid or expired." };
      }
      await store.setPasswordHash?.(record.userId, await hashPassword(password));
      await store.deleteResetToken?.(hashToken(token));
      await store.deleteSessionsForUser?.(record.userId);
      redirect("/login?reset=1");
    }
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: error.message };
    redirect("/dashboard");
  } catch (error) {
    return caught(error);
  }
}

export async function updateProfileAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const displayName = String(formData.get("displayName") ?? "");
  const issue = validateDisplayName(displayName);
  if (issue) return { error: issue };
  try {
    const user = await requireUser();
    await (await getService()).updateDisplayName(user.id, displayName);
    revalidatePath("/account");
    revalidatePath("/dashboard");
    return { message: "Profile saved." };
  } catch (error) {
    return caught(error);
  }
}

export async function createLeagueAction(
  prevOrForm: ActionState | FormData,
  formData?: FormData,
): Promise<ActionState> {
  const submitted = formFromAction(prevOrForm, formData);
  try {
    const user = await requireUser();
    const league = await (await getService()).createLeague(user.id, String(submitted.get("name") ?? ""));
    revalidatePath("/dashboard");
    redirect(`/league/${league.id}`);
  } catch (error) {
    return caught(error);
  }
}

export async function createLeagueFormAction(formData: FormData) {
  try {
    const user = await requireUser();
    const league = await (await getService()).createLeague(user.id, String(formData.get("name") ?? ""));
    revalidatePath("/dashboard");
    redirect(`/league/${league.id}`);
  } catch (error) {
    unstable_rethrow(error);
    redirect(`/dashboard?error=${encodeURIComponent(errorMessage(error))}`);
  }
}

export async function joinLeagueFormAction(formData: FormData) {
  try {
    const user = await requireUser();
    const league = await (await getService()).joinLeague(user.id, String(formData.get("inviteCode") ?? ""));
    revalidatePath("/dashboard");
    redirect(`/league/${league.id}`);
  } catch (error) {
    unstable_rethrow(error);
    redirect(`/dashboard?error=${encodeURIComponent(errorMessage(error))}`);
  }
}

export async function joinLeagueDirect(formData: FormData) {
  await joinLeagueAction({}, formData);
}

export async function joinLeagueAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireUser();
    const league = await (
      await getService()
    ).joinLeague(user.id, String(formData.get("inviteCode") ?? ""));
    revalidatePath("/dashboard");
    redirect(`/league/${league.id}`);
  } catch (error) {
    return caught(error);
  }
}

export async function resetDemoAction() {
  if (!isDemoMode()) return;
  await resetDemoDatabase();
  (await cookies()).delete(DEMO_SESSION_COOKIE);
  redirect("/");
}

export async function savePickAction(
  leagueId: string,
  gameId: string,
  selectedTeam: string,
  refresh = true,
) {
  try {
    const user = await requireUser();
    await (await getService()).savePick(user.id, { leagueId, gameId, selectedTeam });
    if (refresh) refreshLeague(leagueId);
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error) };
  }
}

export async function savePickFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const selectedTeam = String(formData.get("team") ?? "");
  const result = await savePickAction(leagueId, gameId, selectedTeam);
  if ("error" in result && result.error) {
    redirect(`/league/${leagueId}/picks?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/league/${leagueId}/picks`);
}

export async function saveTiebreakerAction(
  leagueId: string,
  season: number,
  week: number,
  prediction: number,
  refresh = true,
) {
  try {
    const user = await requireUser();
    await (await getService()).saveTiebreaker(user.id, { leagueId, season, week, prediction });
    if (refresh) refreshLeague(leagueId);
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error) };
  }
}

export async function saveTiebreakerFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const season = Number(formData.get("season"));
  const week = Number(formData.get("week"));
  const prediction = Number(formData.get("prediction"));
  const result = await saveTiebreakerAction(leagueId, season, week, prediction);
  if ("error" in result && result.error) {
    redirect(`/league/${leagueId}/picks?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/league/${leagueId}/picks`);
}

export async function sendMessageFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const message = String(formData.get("message") ?? "");
  const result = await sendMessageAction(leagueId, message);
  if ("error" in result && result.error) {
    redirect(`/league/${leagueId}/chat?error=${encodeURIComponent(result.error)}`);
  }
  redirect(`/league/${leagueId}/chat`);
}

export async function sendMessageAction(leagueId: string, message: string) {
  try {
    const user = await requireUser();
    const saved = await (await getService()).sendMessage(user.id, leagueId, message);
    const profile = await getCurrentProfile();
    refreshLeague(leagueId);
    return {
      ok: true as const,
      message: { ...saved, displayName: profile?.displayName ?? "You" },
    };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error) };
  }
}

export async function loadMessagesAction(leagueId: string) {
  const user = await requireUser();
  return (await getService()).listMessages(user.id, leagueId);
}

export async function renameLeagueAction(leagueId: string, name: string) {
  try {
    const user = await requireUser();
    await (await getService()).renameLeague(user.id, leagueId, name);
    refreshLeague(leagueId);
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error) };
  }
}

export async function regenerateInviteAction(leagueId: string) {
  try {
    const user = await requireUser();
    const inviteCode = await (await getService()).regenerateInvite(user.id, leagueId);
    refreshLeague(leagueId);
    return { ok: true as const, inviteCode };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error) };
  }
}

export async function removeMemberAction(leagueId: string, userId: string) {
  try {
    const user = await requireUser();
    await (await getService()).removeMember(user.id, leagueId, userId);
    refreshLeague(leagueId);
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error) };
  }
}

export async function leaveLeagueAction(leagueId: string) {
  try {
    const user = await requireUser();
    await (await getService()).leaveLeague(user.id, leagueId);
    revalidatePath("/dashboard");
    redirect("/dashboard");
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error) };
  }
}

export async function setTiebreakerAction(leagueId: string, season: number, week: number, gameId: string) {
  try {
    const user = await requireUser();
    await (await getService()).setTiebreakerGame(user.id, leagueId, season, week, gameId);
    refreshLeague(leagueId);
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error) };
  }
}

export async function previewPickAction(leagueId: string, userId: string, gameId: string) {
  try {
    const user = await requireUser();
    const selectedTeam = await (
      await getService()
    ).commissionerViewPick(user.id, leagueId, userId, gameId);
    return { ok: true as const, selectedTeam };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error) };
  }
}

export async function overridePickAction(input: {
  leagueId: string;
  userId: string;
  gameId: string;
  selectedTeam: string;
  reason?: string;
}) {
  try {
    const user = await requireUser();
    await (await getService()).overridePick(user.id, input);
    refreshLeague(input.leagueId);
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error) };
  }
}

export async function correctResultAction(input: {
  leagueId: string;
  gameId: string;
  status: GameStatus;
  awayScore: number | null;
  homeScore: number | null;
  reason?: string;
}) {
  try {
    const user = await requireUser();
    await (await getService()).correctResult(user.id, input);
    refreshLeague(input.leagueId);
    return { ok: true as const };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error) };
  }
}

function settingsUrl(leagueId: string, params?: Record<string, string>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) search.set(key, value);
  }
  const query = search.toString();
  return query ? `/league/${leagueId}/settings?${query}` : `/league/${leagueId}/settings`;
}

function redirectSettingsError(leagueId: string, error: unknown): never {
  unstable_rethrow(error);
  redirect(settingsUrl(leagueId, { error: errorMessage(error) }));
}

export async function renameLeagueFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const result = await renameLeagueAction(leagueId, String(formData.get("name") ?? ""));
  if ("error" in result && result.error) redirect(settingsUrl(leagueId, { error: result.error }));
  redirect(settingsUrl(leagueId, { notice: "League name saved." }));
}

export async function regenerateInviteFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const result = await regenerateInviteAction(leagueId);
  if ("error" in result && result.error) redirect(settingsUrl(leagueId, { error: result.error }));
  redirect(settingsUrl(leagueId, { notice: "New invite code saved." }));
}

export async function leaveLeagueFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const result = await leaveLeagueAction(leagueId);
  if (result && "error" in result && result.error) {
    redirect(settingsUrl(leagueId, { error: result.error }));
  }
}

export async function beginRemoveMemberFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  redirect(settingsUrl(leagueId, { confirm: "remove", userId }));
}

export async function confirmRemoveMemberFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const result = await removeMemberAction(leagueId, String(formData.get("userId") ?? ""));
  if ("error" in result && result.error) redirect(settingsUrl(leagueId, { error: result.error }));
  redirect(settingsUrl(leagueId, { notice: "Member removed." }));
}

export async function setTiebreakerFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const result = await setTiebreakerAction(
    leagueId,
    Number(formData.get("season")),
    Number(formData.get("week")),
    String(formData.get("gameId") ?? ""),
  );
  if ("error" in result && result.error) redirect(settingsUrl(leagueId, { error: result.error }));
  redirect(settingsUrl(leagueId, { notice: "Monday tiebreaker game updated." }));
}

export async function beginPickCorrectionFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const userId = String(formData.get("userId") ?? "");
  const gameId = String(formData.get("gameId") ?? "");
  const reason = String(formData.get("reason") ?? "").slice(0, 200);
  try {
    const user = await requireUser();
    await (await getService()).commissionerViewPick(user.id, leagueId, userId, gameId);
    redirect(settingsUrl(leagueId, { draft: "pick", userId, gameId, reason }));
  } catch (error) {
    redirectSettingsError(leagueId, error);
  }
}

export async function reviewPickFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  redirect(
    settingsUrl(leagueId, {
      confirm: "pick",
      userId: String(formData.get("userId") ?? ""),
      gameId: String(formData.get("gameId") ?? ""),
      team: String(formData.get("team") ?? ""),
      reason: String(formData.get("reason") ?? "").slice(0, 200),
    }),
  );
}

export async function confirmPickFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const result = await overridePickAction({
    leagueId,
    userId: String(formData.get("userId") ?? ""),
    gameId: String(formData.get("gameId") ?? ""),
    selectedTeam: String(formData.get("team") ?? ""),
    reason: String(formData.get("reason") ?? ""),
  });
  if ("error" in result && result.error) redirect(settingsUrl(leagueId, { error: result.error }));
  redirect(settingsUrl(leagueId, { notice: "Pick updated. The league can see this change." }));
}

export async function reviewResultFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  redirect(
    settingsUrl(leagueId, {
      confirm: "result",
      gameId: String(formData.get("gameId") ?? ""),
      status: String(formData.get("status") ?? ""),
      away: String(formData.get("away") ?? ""),
      home: String(formData.get("home") ?? ""),
      reason: String(formData.get("reason") ?? "").slice(0, 200),
    }),
  );
}

export async function confirmResultFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const away = String(formData.get("away") ?? "");
  const home = String(formData.get("home") ?? "");
  const result = await correctResultAction({
    leagueId,
    gameId: String(formData.get("gameId") ?? ""),
    status: String(formData.get("status") ?? "final") as GameStatus,
    awayScore: away === "" ? null : Number(away),
    homeScore: home === "" ? null : Number(home),
    reason: String(formData.get("reason") ?? ""),
  });
  if ("error" in result && result.error) redirect(settingsUrl(leagueId, { error: result.error }));
  redirect(settingsUrl(leagueId, { notice: "Result updated. The league can see this change." }));
}

export async function syncScheduleFormAction(formData: FormData) {
  const leagueId = String(formData.get("leagueId") ?? "");
  const result = await syncScheduleAction(leagueId);
  if ("error" in result && result.error) redirect(settingsUrl(leagueId, { error: result.error }));
  redirect(settingsUrl(leagueId, { notice: "message" in result && result.message ? result.message : "Schedule synced." }));
}

export async function syncScheduleAction(leagueId: string) {
  try {
    const user = await requireUser();
    const result = await (await getService()).syncSchedule(user.id, leagueId);
    refreshLeague(leagueId);
    return { ok: true as const, message: result.message };
  } catch (error) {
    unstable_rethrow(error);
    return { error: errorMessage(error) };
  }
}
