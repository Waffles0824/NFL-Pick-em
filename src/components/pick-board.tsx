import { Check, Minus, X } from "lucide-react";
import { KickoffTime } from "@/components/kickoff-time";
import type { BoardCell, CellResult, NflGame, PickBoard } from "@/lib/domain/types";
import { cn } from "cn";

export function PickBoardView({ board }: { board: PickBoard }) {
  if (board.games.length === 0) {
    return (
      <div className="rounded-2xl border bg-card px-4 py-10 text-center">
        <p className="font-medium">The NFL schedule for this week has not been loaded yet.</p>
      </div>
    );
  }

  return <BoardTable board={board} />;
}

function BoardTable({ board }: { board: PickBoard }) {
  return (
    <div className="w-full max-w-full overflow-x-auto rounded-2xl border bg-card">
      <table className="w-max min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="sticky left-0 z-10 border-r bg-card px-3 py-3 font-medium">Game</th>
            {board.members.map((member) => {
              const standing = board.standings.find((row) => row.userId === member.userId);
              const won = board.weekComplete && standing?.isWinner;
              return (
                <th
                  key={member.userId}
                  className={cn("px-3 py-3 font-medium whitespace-nowrap", won && "text-correct")}
                  title={member.profile.displayName}
                >
                  {member.profile.displayName}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {board.games.map((game, index) => {
            const stripe = index % 2 === 1 ? "bg-muted/50" : "bg-card";
            return (
              <tr key={game.id} className={cn("border-b", stripe)}>
                <th className={cn("sticky left-0 z-10 border-r px-3 py-3 text-left font-medium whitespace-nowrap", stripe)}>
                  <div>
                    {game.awayTeamAbbreviation} @ {game.homeTeamAbbreviation}
                  </div>
                  <div className="text-xs font-normal text-muted-foreground">
                    <GameMeta game={game} />
                  </div>
                </th>
                {board.members.map((member) => {
                  const cell = board.cells.find(
                    (item) => item.userId === member.userId && item.gameId === game.id,
                  );
                  return (
                    <td key={member.userId} className="px-3 py-3 whitespace-nowrap">
                      <CellView cell={cell} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr className="border-b bg-card">
            <th className="sticky left-0 z-10 border-r bg-card px-3 py-3 text-left font-medium">Monday total</th>
            {board.members.map((member) => {
              const tie = board.tiebreakers.find((row) => row.userId === member.userId);
              return (
                <td key={member.userId} className="px-3 py-3 whitespace-nowrap">
                  {tie?.visibility === "hidden"
                    ? "Hidden"
                    : tie?.prediction == null
                      ? "No guess"
                      : tie.prediction}
                  {tie?.error != null ? (
                    <span className="text-muted-foreground"> · off {tie.error}</span>
                  ) : null}
                </td>
              );
            })}
          </tr>
          <tr className="bg-card">
            <th className="sticky left-0 z-10 border-r bg-card px-3 py-3 text-left font-medium">Correct</th>
            {board.members.map((member) => {
              const standing = board.standings.find((row) => row.userId === member.userId);
              return (
                <td key={member.userId} className="px-3 py-3 font-medium whitespace-nowrap">
                  {standing?.correctPicks ?? 0}/{standing?.eligiblePicks ?? 0}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function GameMeta({ game }: { game: NflGame }) {
  if (game.status === "final") return `${game.awayScore}–${game.homeScore}`;
  if (game.status === "live") return `Live ${game.awayScore ?? 0}–${game.homeScore ?? 0}`;
  if (game.status === "cancelled") return "Cancelled";
  return <KickoffTime iso={game.kickoffAt} />;
}

function CellView({ cell }: { cell: BoardCell | undefined }) {
  if (!cell || cell.result === "hidden" || cell.visibility === "hidden") {
    return <span className="text-muted-foreground">Hidden</span>;
  }
  if (cell.result === "no-pick" || !cell.selectedTeam) {
    return (
      <span className="inline-flex items-center gap-1 text-incorrect">
        <Minus className="size-3.5" aria-hidden />
        No pick
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center gap-1 font-medium", tone(cell.result))}>
      {cell.result === "correct" ? <Check className="size-3.5" aria-label="Correct" /> : null}
      {cell.result === "incorrect" ? <X className="size-3.5" aria-label="Incorrect" /> : null}
      {cell.selectedTeam}
    </span>
  );
}

function tone(result: CellResult) {
  if (result === "correct") return "text-correct";
  if (result === "incorrect") return "text-incorrect";
  return "";
}
