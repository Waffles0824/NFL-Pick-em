import type { GameStatus } from "@/lib/domain/types";

/** Normalized game from a sports-data source, before it is stored. */
export type ProviderGame = {
  providerGameId: string;
  season: number;
  week: number;
  awayTeam: string;
  awayTeamAbbreviation: string;
  homeTeam: string;
  homeTeamAbbreviation: string;
  kickoffAt: string;
  status: GameStatus;
  awayScore: number | null;
  homeScore: number | null;
  winnerTeam: string | null;
  isMondayGame: boolean;
};

/**
 * The only place the app talks to a sports-data source.
 * Swap this implementation later without touching React components.
 */
export interface NflProvider {
  getSeasonSchedule(season: number): Promise<ProviderGame[]>;
  getWeekSchedule(season: number, week: number): Promise<ProviderGame[]>;
  getGame(providerGameId: string): Promise<ProviderGame | null>;
  getGameResults(season: number, week: number): Promise<ProviderGame[]>;
}
