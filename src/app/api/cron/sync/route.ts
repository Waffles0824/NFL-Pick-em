import { isDemoMode } from "@/lib/config";
import { getStore } from "@/lib/db";
import { currentSeasonYear } from "@/lib/domain/time";
import { espnProvider } from "@/lib/nfl/espn";
import { syncSeasonFromProvider } from "@/lib/nfl/sync";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || header !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (isDemoMode()) {
    return Response.json(
      { error: "Demo mode uses the built-in sample schedule." },
      { status: 400 },
    );
  }
  try {
    const result = await syncSeasonFromProvider({
      store: await getStore(),
      provider: espnProvider,
      season: currentSeasonYear(new Date()),
      now: new Date(),
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sync failed.";
    return Response.json({ error: message }, { status: 503 });
  }
}
