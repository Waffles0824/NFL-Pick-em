import { notFound } from "next/navigation";
import { PickSheet } from "@/components/pick-sheet";
import { getCurrentProfile } from "@/lib/auth/current";
import { getService } from "@/lib/db";
import { loadLeaguePage } from "@/server/league-page";

export default async function PicksPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { leagueId } = await params;
  const query = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) notFound();
  const service = await getService();
  const board = await loadLeaguePage(async () => {
    const home = await service.getHome(profile.id, leagueId);
    return service.getPickBoard(profile.id, leagueId, home.season, home.week);
  });
  const sheetKey = [
    ...board.cells
      .filter((cell) => cell.userId === board.viewerId)
      .map((cell) => `${cell.gameId}:${cell.selectedTeam ?? ""}`),
    board.tiebreakers.find((row) => row.userId === board.viewerId)?.prediction ?? "",
  ].join("|");
  return <PickSheet key={sheetKey} board={board} error={query.error} />;
}
