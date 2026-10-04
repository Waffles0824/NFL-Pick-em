import "server-only";

import { createHash } from "node:crypto";
import { cookies } from "next/headers";
import { isDemoMode } from "@/lib/config";
import { getStore } from "@/lib/db";
import type { Profile } from "@/lib/domain/types";

export const DEMO_SESSION_COOKIE = "pickem_session";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function getCurrentProfile(): Promise<Profile | null> {
  if (isDemoMode()) {
    const token = (await cookies()).get(DEMO_SESSION_COOKIE)?.value;
    if (!token) return null;
    const store = await getStore();
    const session = await store.getSessionByTokenHash?.(hashToken(token));
    if (!session) {
      // A stale cookie must not keep the proxy treating this browser as signed in.
      // Cookie writes are only allowed in actions and route handlers.
      try {
        (await cookies()).delete(DEMO_SESSION_COOKIE);
      } catch {
        // The page redirect still sends the browser to login.
      }
      return null;
    }
    return store.getProfile(session.userId);
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const store = await getStore();
  return store.getProfile(data.user.id);
}
