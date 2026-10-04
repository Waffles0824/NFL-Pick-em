import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current";
import { getService } from "@/lib/db";
import { loadLeaguePage } from "@/server/league-page";

export default async function HistoryPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) notFound();
  const service = await getService();
  const weeks = await loadLeaguePage(() => service.listWeekSummaries(profile.id, leagueId));

  return (
    <div>
      <h1 className="text-4xl tracking-tight">Week history</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Finished weeks keep their scores, picks, and Monday totals.
      </p>

      {weeks.length === 0 ? (
        <p className="mt-8 text-sm">No weeks have been loaded yet.</p>
      ) : (
        <div className="mt-6 space-y-2">
          <div className="hidden grid-cols-[minmax(5rem,0.7fr)_minmax(6rem,0.8fr)_minmax(10rem,1.5fr)] gap-4 px-4 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:grid">
            <span>Week</span>
            <span>Record</span>
            <span>Winner</span>
          </div>

          <div className="overflow-hidden rounded-2xl border bg-card">
            {weeks.map((week) => {
              const record =
                week.weekComplete && week.eligiblePicks > 0
                  ? `${week.correctPicks}/${week.eligiblePicks}`
                  : "—";
              const winnerNames = week.winners.map((winner) => winner.displayName).join(" and ");
              const winnerPercentage = week.winners[0]?.pickPercentage;

              return (
                <Link
                  key={week.week}
                  href={`/league/${leagueId}/history/${week.week}`}
                  className="grid gap-2 border-b px-4 py-4 transition-colors last:border-0 hover:bg-muted/40 sm:grid-cols-[minmax(5rem,0.7fr)_minmax(6rem,0.8fr)_minmax(10rem,1.5fr)] sm:items-center sm:gap-4"
                >
                  <div>
                    <span className="text-xs font-medium text-muted-foreground sm:hidden">Week</span>
                    <div className="font-medium">Week {week.week}</div>
                  </div>

                  <div>
                    <span className="text-xs font-medium text-muted-foreground sm:hidden">Record</span>
                    <div className="whitespace-nowrap">{record}</div>
                  </div>

                  <div>
                    <span className="text-xs font-medium text-muted-foreground sm:hidden">Winner</span>
                    {week.winners.length > 0 ? (
                      <div className="font-medium">
                        {winnerNames}
                        {winnerPercentage != null ? (
                          <span className="font-normal text-muted-foreground">
                            {" "}
                            · {winnerPercentage.toFixed(1)}%
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="text-muted-foreground">In progress</div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
