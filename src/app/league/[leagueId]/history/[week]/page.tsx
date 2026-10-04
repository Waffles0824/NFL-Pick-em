import Link from "next/link";
import { notFound } from "next/navigation";
import { PickBoardView } from "@/components/pick-board";
import { WinnerBanner } from "@/components/winner-banner";
import { getCurrentProfile } from "@/lib/auth/current";
import { getService } from "@/lib/db";
import { loadLeaguePage } from "@/server/league-page";

export default async function HistoryWeekPage({
  params,
}: {
  params: Promise<{ leagueId: string; week: string }>;
}) {
  const { leagueId, week: weekParam } = await params;
  const week = Number(weekParam);
  if (!Number.isInteger(week) || week < 1 || week > 18) notFound();
  const profile = await getCurrentProfile();
  if (!profile) notFound();
  const service = await getService();
  const board = await loadLeaguePage(async () => {
    const home = await service.getHome(profile.id, leagueId);
    const weeks = await service.listWeeks(profile.id, leagueId);
    if (!weeks.includes(week)) notFound();
    return service.getPickBoard(profile.id, leagueId, home.season, week);
  });
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-4xl tracking-tight">Week {week}</h1>
        <p className="text-sm text-muted-foreground">
          Final scores, every pick, and the Monday total.
        </p>
        <Link className="mt-2 inline-block text-sm underline" href={`/league/${leagueId}/history`}>
          All weeks
        </Link>
      </div>
      <WinnerBanner board={board} />
      {board.tiebreakerGame ? (
        <p className="text-sm text-muted-foreground">
          Monday game {board.tiebreakerGame.awayTeamAbbreviation} @{" "}
          {board.tiebreakerGame.homeTeamAbbreviation}
          {board.tiebreakerActual != null ? ` · combined points ${board.tiebreakerActual}` : ""}
        </p>
      ) : null}
      <PickBoardView board={board} />
    </div>
  );
}
