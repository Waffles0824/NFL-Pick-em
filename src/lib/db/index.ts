import "server-only";

import { hasServiceRole, isDemoMode } from "@/lib/config";
import { getDemoStore } from "@/lib/db/demo-store";
import { createSupabaseStore } from "@/lib/db/supabase-store";
import type { DataStore } from "@/lib/db/types";
import { createLeagueService, type LeagueService } from "@/lib/domain/service";

export async function getStore(): Promise<DataStore> {
  if (isDemoMode()) return getDemoStore();
  const { createClient } = await import("@/lib/supabase/server");
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const user = await createClient();
  const admin = hasServiceRole() ? createAdminClient() : null;
  return createSupabaseStore(user, admin);
}

export async function getService(): Promise<LeagueService> {
  return createLeagueService(await getStore());
}
