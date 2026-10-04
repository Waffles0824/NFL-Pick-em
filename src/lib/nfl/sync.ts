import type { DataStore } from "@/lib/db/types";
import type { NflGame } from "@/lib/domain/types";
import type { NflProvider, ProviderGame } from "@/lib/nfl/provider";

export async function syncSeasonFromProvider(input: {
  store: DataStore;
  provider: NflProvider;
  season: number;
  now: Date;
}): Promise<{ upserted: number; skippedFinalChanges: number }> {
  const incoming = await input.provider.getSeasonSchedule(input.season);
  const existing = await input.store.listGames(input.season);
  const byProvider = new Map(existing.map((game) => [game.providerGameId, game]));
  const writes: NflGame[] = [];
  let skippedFinalChanges = 0;

  for (const game of incoming) {
    const previous = byProvider.get(game.providerGameId);
    if (!previous) {
      writes.push(toStoredGame(game, crypto.randomUUID(), input.now, input.now));
      continue;
    }
    if (previous.status === "final" && finalsDiffer(previous, game)) {
      skippedFinalChanges += 1;
      continue;
    }
    writes.push({
      ...previous,
      season: game.season,
      week: game.week,
      awayTeam: game.awayTeam,
      awayTeamAbbreviation: game.awayTeamAbbreviation,
      homeTeam: game.homeTeam,
      homeTeamAbbreviation: game.homeTeamAbbreviation,
      kickoffAt: game.kickoffAt,
      status: previous.status === "final" ? "final" : game.status,
      awayScore: previous.status === "final" ? previous.awayScore : game.awayScore,
      homeScore: previous.status === "final" ? previous.homeScore : game.homeScore,
      winnerTeam: previous.status === "final" ? previous.winnerTeam : game.winnerTeam,
      isMondayGame: game.isMondayGame,
      updatedAt: input.now.toISOString(),
    });
  }

  await input.store.upsertGames(writes);
  return { upserted: writes.length, skippedFinalChanges };
}

function finalsDiffer(previous: NflGame, incoming: ProviderGame): boolean {
  return (
    incoming.status === "final" &&
    (previous.awayScore !== incoming.awayScore ||
      previous.homeScore !== incoming.homeScore ||
      previous.winnerTeam !== incoming.winnerTeam)
  );
}

function toStoredGame(
  game: ProviderGame,
  id: string,
  createdAt: Date,
  updatedAt: Date,
): NflGame {
  return {
    id,
    providerGameId: game.providerGameId,
    season: game.season,
    week: game.week,
    awayTeam: game.awayTeam,
    awayTeamAbbreviation: game.awayTeamAbbreviation,
    homeTeam: game.homeTeam,
    homeTeamAbbreviation: game.homeTeamAbbreviation,
    kickoffAt: game.kickoffAt,
    status: game.status,
    awayScore: game.awayScore,
    homeScore: game.homeScore,
    winnerTeam: game.winnerTeam,
    isMondayGame: game.isMondayGame,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}
