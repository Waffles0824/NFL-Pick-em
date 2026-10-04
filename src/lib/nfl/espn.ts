import { AppError } from "@/lib/domain/errors";
import { isMondayKickoff } from "@/lib/domain/time";
import { winnerFromScores } from "@/lib/domain/scoring";
import type { GameStatus } from "@/lib/domain/types";
import type { NflProvider, ProviderGame } from "@/lib/nfl/provider";

const SCOREBOARD =
  "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard";

type EspnCompetitor = {
  homeAway?: string;
  score?: string;
  team?: {
    abbreviation?: string;
    displayName?: string;
  };
};

type EspnEvent = {
  id?: string;
  date?: string;
  season?: { year?: number; type?: number };
  week?: { number?: number };
  competitions?: {
    status?: { type?: { name?: string } };
    competitors?: EspnCompetitor[];
  }[];
};

type EspnScoreboard = {
  events?: EspnEvent[];
  week?: { number?: number };
  season?: { year?: number };
};

export function mapEspnStatus(name: string | undefined): GameStatus {
  switch (name) {
    case "STATUS_FINAL":
    case "STATUS_FINAL_OVERTIME":
    case "STATUS_FULL_TIME":
      return "final";
    case "STATUS_IN_PROGRESS":
    case "STATUS_HALFTIME":
    case "STATUS_END_PERIOD":
      return "live";
    case "STATUS_POSTPONED":
    case "STATUS_DELAYED":
      return "postponed";
    case "STATUS_CANCELED":
    case "STATUS_CANCELLED":
      return "cancelled";
    default:
      return "scheduled";
  }
}

function scoreValue(value: string | undefined, status: GameStatus): number | null {
  if (value == null || value === "") return null;
  if (status === "scheduled" || status === "postponed" || status === "cancelled") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseEspnEvent(event: EspnEvent, fallbackSeason: number, fallbackWeek: number): ProviderGame | null {
  if (!event.id || !event.date) return null;
  if (event.season?.type != null && event.season.type !== 2) return null;
  const competition = event.competitions?.[0];
  const competitors = competition?.competitors ?? [];
  const home = competitors.find((team) => team.homeAway === "home");
  const away = competitors.find((team) => team.homeAway === "away");
  if (!home?.team?.abbreviation || !away?.team?.abbreviation) return null;
  const status = mapEspnStatus(competition?.status?.type?.name);
  const awayScore = scoreValue(away.score, status);
  const homeScore = scoreValue(home.score, status);
  const awayAbbr = away.team.abbreviation;
  const homeAbbr = home.team.abbreviation;
  return {
    providerGameId: String(event.id),
    season: event.season?.year ?? fallbackSeason,
    week: event.week?.number ?? fallbackWeek,
    awayTeam: away.team.displayName ?? awayAbbr,
    awayTeamAbbreviation: awayAbbr,
    homeTeam: home.team.displayName ?? homeAbbr,
    homeTeamAbbreviation: homeAbbr,
    kickoffAt: new Date(event.date).toISOString(),
    status,
    awayScore,
    homeScore,
    winnerTeam: winnerFromScores(
      { awayTeamAbbreviation: awayAbbr, homeTeamAbbreviation: homeAbbr },
      status,
      awayScore,
      homeScore,
    ),
    isMondayGame: isMondayKickoff(new Date(event.date).toISOString()),
  };
}

export function parseEspnScoreboard(
  payload: EspnScoreboard,
  season: number,
  week: number,
): ProviderGame[] {
  return (payload.events ?? [])
    .map((event) => parseEspnEvent(event, season, week))
    .filter((game): game is ProviderGame => game !== null);
}

async function fetchWeek(season: number, week: number): Promise<ProviderGame[]> {
  const url = `${SCOREBOARD}?dates=${season}&seasontype=2&week=${week}`;
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch {
    throw new AppError(
      "The NFL schedule is temporarily unavailable. Try again in a few minutes.",
      "UNAVAILABLE",
    );
  }
  if (!response.ok) {
    throw new AppError(
      "The NFL schedule is temporarily unavailable. Try again in a few minutes.",
      "UNAVAILABLE",
    );
  }
  const payload = (await response.json()) as EspnScoreboard;
  return parseEspnScoreboard(payload, season, week);
}

export const espnProvider: NflProvider = {
  async getSeasonSchedule(season: number) {
    const weeks = await Promise.all(
      Array.from({ length: 18 }, (_, index) => fetchWeek(season, index + 1)),
    );
    const byId = new Map<string, ProviderGame>();
    for (const week of weeks) {
      for (const game of week) byId.set(game.providerGameId, game);
    }
    return [...byId.values()].sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
  },
  getWeekSchedule(season: number, week: number) {
    return fetchWeek(season, week);
  },
  async getGame(providerGameId: string) {
    const season = new Date().getUTCFullYear();
    const schedule = await this.getSeasonSchedule(season);
    return schedule.find((game) => game.providerGameId === providerGameId) ?? null;
  },
  getGameResults(season: number, week: number) {
    return fetchWeek(season, week);
  },
};
