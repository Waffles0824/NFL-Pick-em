import { Trophy } from "lucide-react";
import type { PickBoard } from "@/lib/domain/types";

export function WinnerBanner({ board }: { board: PickBoard }) {
  if (!board.weekComplete) return null;
  const winners = board.standings.filter((row) => row.isWinner);
  if (winners.length === 0) return null;
  const title =
    winners.length === 1 ? `Week ${board.week} winner` : `Week ${board.week} winners`;
  return (
    <section className="rounded-2xl border bg-card p-4">
      <p className="flex items-center gap-2 text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
        <Trophy className="size-4" aria-hidden />
        {title}
      </p>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {winners.map((winner) => (
          <li key={winner.userId}>
            <p className="font-heading text-3xl tracking-tight">{winner.displayName}</p>
            <p className="text-sm text-muted-foreground">
              {winner.correctPicks} / {winner.eligiblePicks} correct
            </p>
            {board.tiebreakerNeeded && winner.tiebreakerError != null ? (
              <p className="text-sm text-muted-foreground">
                MNF guess {winner.tiebreakerPrediction ?? "—"} · actual {winner.tiebreakerActual ?? "—"} ·
                off by {winner.tiebreakerError}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
