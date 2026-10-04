import { notFound } from "next/navigation";
import { PickBoardView } from "@/components/pick-board";
import { WinnerBanner } from "@/components/winner-banner";
import { getCurrentProfile } from "@/lib/auth/current";
import { getService } from "@/lib/db";
import { loadLeaguePage } from "@/server/league-page";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) notFound();
  const service = await getService();
  const board = await loadLeaguePage(async () => {
    const home = await service.getHome(profile.id, leagueId);
    return service.getPickBoard(profile.id, leagueId, home.season, home.week);
  });
  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
          Week {board.week}
        </p>
        <h1 className="text-4xl tracking-tight">Pick board</h1>
        <p className="text-sm text-muted-foreground">
          Other picks stay hidden until that game kicks off.
        </p>
      </div>
      <WinnerBanner board={board} />
      <PickBoardView board={board} />
    </div>
  );
}
