import Link from "next/link";
import { notFound } from "next/navigation";
import { KickoffTime, LockCountdown } from "@/components/kickoff-time";
import { Button } from "@/components/ui/button";
import { WeekSchedule } from "@/components/week-schedule";
import { getCurrentProfile } from "@/lib/auth/current";
import { getService } from "@/lib/db";
import { matchupLabel } from "@/lib/domain/format";
import { loadLeaguePage } from "@/server/league-page";

export default async function LeagueHomePage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) notFound();
  const home = await loadLeaguePage(async () =>
    (await getService()).getHome(profile.id, leagueId),
  );
  const leaders = [...home.liveStandings].slice(0, 5);
  const lastWinners = home.lastWeek?.standings.filter((row) => row.isWinner) ?? [];
  return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
              Week {home.week}
            </p>
            <h1 className="text-4xl tracking-tight">{home.league.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {home.myPicksMade} of {home.totalGames} picks made
            </p>
          </div>
          <Button asChild className="h-11 px-5">
            <Link href={`/league/${leagueId}/picks`}>Make my picks</Link>
          </Button>
        </div>

        {home.nextGame ? (
          <p className="text-sm text-muted-foreground">
            Next: {matchupLabel(home.nextGame.awayTeam, home.nextGame.homeTeam)} ·{" "}
            <KickoffTime iso={home.nextGame.kickoffAt} /> ·{" "}
            <LockCountdown iso={home.nextGame.kickoffAt} />
          </p>
        ) : null}

        <WeekSchedule games={home.games} />

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-medium text-muted-foreground">This week</h2>
            <ul className="mt-3 space-y-2">
              {leaders.map((row) => (
                <li key={row.userId} className="flex justify-between text-sm">
                  <span>{row.displayName}</span>
                  <span>
                    {row.correctPicks} correct
                    {row.isWinner && home.games.every((game) => game.status === "final" || game.status === "cancelled")
                      ? " · winner"
                      : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          {home.lastWeek ? (
            <div className="rounded-xl border bg-card p-4">
              <h2 className="text-sm font-medium text-muted-foreground">Last week</h2>
              {home.lastWeek.weekComplete && lastWinners.length > 0 ? (
                <div className="mt-2">
                  <p className="text-lg tracking-tight">
                    {lastWinners.length === 1 ? "Winner" : "Winners"}:{" "}
                    {lastWinners.map((row) => row.displayName).join(" and ")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {lastWinners[0].correctPicks} / {lastWinners[0].eligiblePicks} correct
                    {home.lastWeek.tiebreakerNeeded && lastWinners[0].tiebreakerError != null
                      ? ` · MNF off by ${lastWinners[0].tiebreakerError}`
                      : ""}
                  </p>
                  <Link
                    className="mt-2 inline-block text-sm underline"
                    href={`/league/${leagueId}/history/${home.lastWeek.week}`}
                  >
                    Open week {home.lastWeek.week}
                  </Link>
                </div>
              ) : (
                <p className="mt-2 text-sm">Week {home.lastWeek.week} is not final yet.</p>
              )}
            </div>
          ) : null}
        </section>

        <section>
          <h2 className="text-sm font-medium text-muted-foreground">Recent activity</h2>
          {home.notifications.length === 0 ? (
            <p className="mt-2 text-sm">No league notes yet.</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {home.notifications.map((note) => (
                <li key={note.id} className="text-sm">
                  {note.body}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
  );
}
