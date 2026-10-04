import { TeamMark } from "@/components/team-mark";
import { teamCity } from "@/lib/domain/format";
import { formatScheduleDay, scheduleDayKey } from "@/lib/domain/time";
import type { NflGame } from "@/lib/domain/types";
import { cn } from "cn";

export function groupGamesByDay(games: NflGame[]) {
  const ordered = [...games].sort(
    (a, b) => new Date(a.kickoffAt).getTime() - new Date(b.kickoffAt).getTime(),
  );
  const groups: { key: string; label: string; games: NflGame[] }[] = [];
  for (const game of ordered) {
    const key = scheduleDayKey(game.kickoffAt);
    const current = groups.at(-1);
    if (current?.key === key) current.games.push(game);
    else groups.push({ key, label: formatScheduleDay(game.kickoffAt), games: [game] });
  }
  return groups;
}

export function WeekSchedule({ games }: { games: NflGame[] }) {
  if (games.length === 0) {
    return (
      <p className="rounded-xl border bg-card px-3 py-8 text-center text-sm">
        The NFL schedule for this week has not been loaded yet.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {groupGamesByDay(games).map((group) => (
        <section key={group.key}>
          <h2 className="border-b px-3 py-2 text-sm font-semibold">{group.label}</h2>
          <p className="border-b px-3 py-1 text-[10px] font-medium tracking-[0.14em] text-muted-foreground">
            MATCHUP
          </p>
          <ul>
            {group.games.map((game, index) => (
              <li
                key={game.id}
                className={cn(
                  "grid grid-cols-[minmax(0,1fr)_2.5rem_minmax(0,1fr)] items-center gap-2 border-b px-3 py-1.5 text-sm last:border-b-0",
                  index % 2 === 1 && "bg-muted/50",
                )}
              >
                <TeamSide name={game.awayTeam} abbreviation={game.awayTeamAbbreviation} />
                <span className="text-center text-xs text-muted-foreground">
                  {centerLabel(game)}
                </span>
                <TeamSide name={game.homeTeam} abbreviation={game.homeTeamAbbreviation} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function centerLabel(game: NflGame): string {
  if (game.status === "cancelled") return "—";
  if (game.status === "final" || game.status === "live") {
    return `${game.awayScore ?? 0}–${game.homeScore ?? 0}`;
  }
  return "@";
}

export function TeamSide({
  name,
  abbreviation,
}: {
  name: string;
  abbreviation: string;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <TeamMark abbreviation={abbreviation} />
      <span className="truncate">{teamCity(name)}</span>
    </span>
  );
}
