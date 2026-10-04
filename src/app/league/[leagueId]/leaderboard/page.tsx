import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current";
import { getService } from "@/lib/db";
import { loadLeaguePage } from "@/server/league-page";

export default async function LeaderboardPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) notFound();
  const board = await loadLeaguePage(async () =>
    (await getService()).getLeaderboard(profile.id, leagueId),
  );
  return (
      <div>
        <h1 className="text-4xl tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {board.season} season. Weekly wins, then pick percentage. Future games are not in the
          total. A tie counts as a miss. Cancelled games are skipped.
        </p>
        {board.rows.length === 0 ? (
          <p className="mt-8 text-sm">No members yet.</p>
        ) : (
          <ol className="mt-6 divide-y rounded-2xl border bg-card">
            {board.rows.map((row, index) => (
              <li key={row.userId} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="font-medium">
                    {index + 1}. {row.displayName}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {row.weeklyWins} weekly {row.weeklyWins === 1 ? "win" : "wins"}
                    {row.sharedWins > 0 ? ` · ${row.sharedWins} shared` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-medium">
                    {row.correctPicks} / {row.eligiblePicks}
                  </p>
                  <p className="text-sm text-muted-foreground">{row.pickPercentage.toFixed(1)}%</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
  );
}
