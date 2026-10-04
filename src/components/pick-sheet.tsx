"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { KickoffTime } from "@/components/kickoff-time";
import { TeamMark } from "@/components/team-mark";
import { Button } from "@/components/ui/button";
import { groupGamesByDay } from "@/components/week-schedule";
import { teamCity } from "@/lib/domain/format";
import { isPickLocked } from "@/lib/domain/scoring";
import type { NflGame, PickBoard } from "@/lib/domain/types";
import { savePickAction, savePickFormAction, saveTiebreakerAction, saveTiebreakerFormAction } from "@/server/actions";
import { cn } from "cn";

function picksFromBoard(board: PickBoard) {
  const map = new Map<string, string>();
  for (const cell of board.cells) {
    if (cell.userId === board.viewerId && cell.selectedTeam) {
      map.set(cell.gameId, cell.selectedTeam);
    }
  }
  return map;
}

export function PickSheet({ board, error }: { board: PickBoard; error?: string }) {
  const [picks, setPicks] = useState(() => picksFromBoard(board));
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(error ?? null);
  const ownTie = board.tiebreakers.find((row) => row.userId === board.viewerId);
  const [prediction, setPrediction] = useState(ownTie?.prediction?.toString() ?? "");

  async function selectTeam(gameId: string, team: string) {
    const previous = picks.get(gameId) ?? null;
    if (previous === team) return;
    setPicks((current) => {
      const next = new Map(current);
      next.set(gameId, team);
      return next;
    });
    setSaving(true);
    setNotice(null);
    const result = await savePickAction(board.league.id, gameId, team, false);
    setSaving(false);
    if ("error" in result && result.error) {
      setPicks((current) => {
        const next = new Map(current);
        if (previous) next.set(gameId, previous);
        else next.delete(gameId);
        return next;
      });
      setNotice(result.error);
      return;
    }
    setNotice(null);
  }

  async function saveTotal(formData: FormData) {
    const value = Number(formData.get("prediction"));
    setSaving(true);
    setNotice(null);
    const result = await saveTiebreakerAction(board.league.id, board.season, board.week, value, false);
    setSaving(false);
    if ("error" in result && result.error) {
      setNotice(result.error);
      return;
    }
    setPrediction(String(value));
  }

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const made = board.games.filter((game) => picks.get(game.id)).length;
  const openGames = board.games.filter((game) => game.status !== "cancelled");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            Week {board.week}
          </p>
          <h1 className="text-4xl tracking-tight">Make picks</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {made} of {openGames.length} picks made. Each game locks at its own kickoff.
          </p>
        </div>
        <p className={`text-sm font-medium ${notice ? "text-destructive" : "text-emerald-800"}`} aria-live="polite">
          {saving ? "Saving…" : notice || "All changes saved"}
        </p>
      </div>

      {board.games.length === 0 ? (
        <div className="rounded-2xl border bg-card px-4 py-10 text-center">
          <p className="font-medium">The NFL schedule for this week has not been loaded yet.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A commissioner can sync the schedule from league settings.
          </p>
        </div>
      ) : null}

      {board.games.length > 0 ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          {groupGamesByDay(board.games).map((group) => (
            <section key={group.key}>
              <h2 className="border-b px-3 py-2 text-sm font-semibold">{group.label}</h2>
              <p className="border-b px-3 py-1 text-[10px] font-medium tracking-[0.14em] text-muted-foreground">
                MATCHUP
              </p>
              <ul>
                {group.games.map((game) => (
                  <MatchupRow
                    key={game.id}
                    leagueId={board.league.id}
                    game={game}
                    selected={picks.get(game.id) ?? null}
                    now={now}
                    onSelect={selectTeam}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}

      {board.tiebreakerGame ? (
        <section className="rounded-2xl border bg-card p-4">
          <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
            Monday tiebreaker
          </p>
          <h2 className="mt-1 text-2xl tracking-tight">
            Predict the total combined points in {board.tiebreakerGame.awayTeamAbbreviation} @{" "}
            {board.tiebreakerGame.homeTeamAbbreviation}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            <KickoffTime iso={board.tiebreakerGame.kickoffAt} />. One number. It stays hidden until
            kickoff.
          </p>
          <form
            action={saveTiebreakerFormAction}
            className="mt-4 flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void saveTotal(new FormData(event.currentTarget));
            }}
          >
            <input type="hidden" name="leagueId" value={board.league.id} />
            <input type="hidden" name="season" value={board.season} />
            <input type="hidden" name="week" value={board.week} />
            <div>
              <label className="block text-sm font-medium" htmlFor="mnf-total">
                Combined points
              </label>
              <input
                id="mnf-total"
                name="prediction"
                inputMode="numeric"
                value={prediction}
                onChange={(event) => setPrediction(event.target.value)}
                disabled={isPickLocked(board.tiebreakerGame, new Date(now))}
                className="mt-1 h-12 w-32 rounded-xl border bg-background px-3 text-lg"
              />
            </div>
            <Button type="submit" className="h-12" disabled={isPickLocked(board.tiebreakerGame, new Date(now)) || saving}>
              Save total
            </Button>
          </form>
        </section>
      ) : null}

      <details className="rounded-2xl border bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium">Review picks</summary>
        <p className="mt-2 text-sm text-muted-foreground">
          These picks are already saved. You can change any game until it kicks off.
        </p>
        <ul className="mt-3 max-h-80 space-y-2 overflow-auto text-sm">
          {board.games.map((game) => (
            <li key={game.id} className="flex justify-between gap-3">
              <span>
                {game.awayTeamAbbreviation} @ {game.homeTeamAbbreviation}
              </span>
              <span className="font-medium">{picks.get(game.id) ?? "No pick yet"}</span>
            </li>
          ))}
          <li className="flex justify-between gap-3 border-t pt-2">
            <span>Monday total</span>
            <span className="font-medium">{prediction || "No guess yet"}</span>
          </li>
        </ul>
      </details>
    </div>
  );
}

function MatchupRow({
  leagueId,
  game,
  selected,
  now,
  onSelect,
}: {
  leagueId: string;
  game: NflGame;
  selected: string | null;
  now: number;
  onSelect: (gameId: string, team: string) => Promise<void>;
}) {
  const locked = isPickLocked(game, new Date(now)) || game.status === "cancelled";
  const cellResult =
    game.status === "final"
      ? selected
        ? selected === game.winnerTeam
          ? "correct"
          : "incorrect"
        : "no-pick"
      : locked
        ? "locked"
        : "pending";
  const center =
    game.status === "final" || game.status === "live"
      ? `${game.awayScore ?? 0}–${game.homeScore ?? 0}`
      : game.status === "cancelled"
        ? "—"
        : !selected && locked
          ? "No pick"
          : "@";

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-center gap-2 border-b px-2 py-2 last:border-b-0">
      <TeamButton
        leagueId={leagueId}
        gameId={game.id}
        name={game.awayTeam}
        abbr={game.awayTeamAbbreviation}
        selected={selected === game.awayTeamAbbreviation}
        result={selected === game.awayTeamAbbreviation ? cellResult : "pending"}
        disabled={locked}
        onSelect={() => onSelect(game.id, game.awayTeamAbbreviation)}
      />
      <span className={cn("text-center text-xs", center === "No pick" ? "text-incorrect" : "text-muted-foreground")}>
        {center}
      </span>
      <TeamButton
        leagueId={leagueId}
        gameId={game.id}
        name={game.homeTeam}
        abbr={game.homeTeamAbbreviation}
        selected={selected === game.homeTeamAbbreviation}
        result={selected === game.homeTeamAbbreviation ? cellResult : "pending"}
        disabled={locked}
        onSelect={() => onSelect(game.id, game.homeTeamAbbreviation)}
      />
    </li>
  );
}

function TeamButton({
  leagueId,
  gameId,
  name,
  abbr,
  selected,
  result,
  disabled,
  onSelect,
}: {
  leagueId: string;
  gameId: string;
  name: string;
  abbr: string;
  selected: boolean;
  result: string;
  disabled: boolean;
  onSelect: () => Promise<void>;
}) {
  const chosen = selected && result !== "incorrect";
  const wrong = selected && result === "incorrect";
  return (
    <form
      action={savePickFormAction}
      onSubmit={(event) => {
        event.preventDefault();
        void onSelect();
      }}
    >
      <input type="hidden" name="leagueId" value={leagueId} />
      <input type="hidden" name="gameId" value={gameId} />
      <input type="hidden" name="team" value={abbr} />
      <button
        type="submit"
        disabled={disabled}
        aria-pressed={selected}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 text-left text-sm font-medium shadow-sm transition disabled:cursor-not-allowed",
          !selected && "border-border bg-background hover:border-emerald-700 hover:bg-emerald-50",
          chosen && "border-emerald-800 bg-emerald-600 text-white shadow-none hover:bg-emerald-700",
          wrong && "border-red-800 bg-red-600 text-white shadow-none",
          disabled && !selected && "opacity-70 hover:border-border hover:bg-background",
        )}
      >
        <TeamMark abbreviation={abbr} className={selected ? "brightness-110" : undefined} />
        <span className="truncate">{teamCity(name)}</span>
        {chosen ? <Check className="ml-auto size-4 shrink-0" aria-label={result === "correct" ? "Correct" : "Selected"} /> : null}
        {wrong ? <X className="ml-auto size-4 shrink-0" aria-label="Incorrect" /> : null}
      </button>
    </form>
  );
}
