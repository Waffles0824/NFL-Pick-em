import { describe, expect, it } from "vitest";
import { MemoryStore } from "@/lib/db/memory";
import { createLeagueService } from "@/lib/domain/service";
import {
  defaultTiebreakerGame,
  scoreWeek,
  tiebreakerError,
} from "@/lib/domain/scoring";
import { isMondayKickoff, zonedDateTimeToUtc } from "@/lib/domain/time";
import type { NflGame, Profile } from "@/lib/domain/types";
import { parseEspnScoreboard } from "@/lib/nfl/espn";
import { syncSeasonFromProvider } from "@/lib/nfl/sync";
import type { ProviderGame } from "@/lib/nfl/provider";

const alex = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const dylan = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const john = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const outsider = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
const leagueId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";

function profile(id: string, name: string): Profile {
  return {
    id,
    displayName: name,
    email: `${name.toLowerCase()}@example.com`,
    avatarUrl: null,
    createdAt: "2026-09-01T00:00:00.000Z",
  };
}

function game(overrides: Partial<NflGame> = {}): NflGame {
  return {
    id: crypto.randomUUID(),
    providerGameId: crypto.randomUUID(),
    season: 2026,
    week: 5,
    awayTeam: "Philadelphia Eagles",
    awayTeamAbbreviation: "PHI",
    homeTeam: "Dallas Cowboys",
    homeTeamAbbreviation: "DAL",
    kickoffAt: "2026-10-02T00:15:00.000Z",
    status: "scheduled",
    awayScore: null,
    homeScore: null,
    winnerTeam: null,
    isMondayGame: false,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

async function leagueWith(games: NflGame[], members = [alex, dylan, john]) {
  const store = new MemoryStore();
  await store.insertProfile(profile(alex, "Alex"));
  await store.insertProfile(profile(dylan, "Dylan"));
  await store.insertProfile(profile(john, "John"));
  await store.insertProfile(profile(outsider, "Outsider"));
  await store.insertLeague({
    id: leagueId,
    name: "Test Sheet",
    inviteCode: "K7R9Q2",
    commissionerUserId: alex,
    seasonYear: 2026,
    timezone: "America/New_York",
    active: true,
    createdAt: "2026-09-01T00:00:00.000Z",
  });
  for (const userId of members) {
    await store.insertMember({
      leagueId,
      userId,
      role: userId === alex ? "commissioner" : "member",
      joinedAt: "2026-09-01T00:00:00.000Z",
    });
  }
  await store.upsertGames(games);
  return store;
}

describe("kickoff locking", () => {
  it("saves a pick before kickoff", async () => {
    const slate = game({ kickoffAt: "2026-10-02T00:15:00.000Z" });
    const store = await leagueWith([slate]);
    const service = createLeagueService(store, () => new Date("2026-10-01T18:00:00.000Z"));
    const saved = await service.savePick(dylan, {
      leagueId,
      gameId: slate.id,
      selectedTeam: "PHI",
    });
    expect(saved.selectedTeam).toBe("PHI");
  });

  it("rejects a pick after kickoff using server time", async () => {
    const slate = game({
      kickoffAt: "2026-10-02T00:15:00.000Z",
      status: "scheduled",
    });
    const store = await leagueWith([slate]);
    const service = createLeagueService(store, () => new Date("2026-10-02T00:15:01.000Z"));
    await expect(
      service.savePick(dylan, { leagueId, gameId: slate.id, selectedTeam: "PHI" }),
    ).rejects.toMatchObject({ code: "LOCKED" });
  });
});

describe("pick privacy", () => {
  it("hides another player's pick before kickoff", async () => {
    const slate = game({ kickoffAt: "2026-10-02T00:15:00.000Z" });
    const store = await leagueWith([slate]);
    const service = createLeagueService(store, () => new Date("2026-10-01T18:00:00.000Z"));
    await service.savePick(dylan, { leagueId, gameId: slate.id, selectedTeam: "PHI" });
    const board = await service.getPickBoard(john, leagueId, 2026, 5);
    const cell = board.cells.find((item) => item.userId === dylan && item.gameId === slate.id);
    expect(cell).toMatchObject({ visibility: "hidden", selectedTeam: null, result: "hidden" });
    expect(JSON.stringify(cell)).not.toContain("PHI");
  });

  it("reveals locked picks after kickoff", async () => {
    const slate = game({ kickoffAt: "2026-10-02T00:15:00.000Z", status: "live" });
    const store = await leagueWith([slate]);
    await store.upsertPick({
      id: crypto.randomUUID(),
      leagueId,
      season: 2026,
      week: 5,
      userId: dylan,
      gameId: slate.id,
      selectedTeam: "PHI",
      createdAt: "2026-10-01T12:00:00.000Z",
      updatedAt: "2026-10-01T12:00:00.000Z",
    });
    const service = createLeagueService(store, () => new Date("2026-10-02T00:20:00.000Z"));
    const board = await service.getPickBoard(john, leagueId, 2026, 5);
    const cell = board.cells.find((item) => item.userId === dylan && item.gameId === slate.id);
    expect(cell).toMatchObject({ visibility: "revealed", selectedTeam: "PHI", result: "locked" });
  });

  it("hides another player's Monday total until that game kicks off", async () => {
    const monday = game({
      id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc1",
      kickoffAt: "2026-10-06T00:15:00.000Z",
      isMondayGame: true,
      awayTeamAbbreviation: "ATL",
      homeTeamAbbreviation: "NO",
    });
    const store = await leagueWith([monday]);
    const before = createLeagueService(store, () => new Date("2026-10-05T12:00:00.000Z"));
    await before.saveTiebreaker(dylan, { leagueId, season: 2026, week: 5, prediction: 47 });
    const hidden = await before.getPickBoard(john, leagueId, 2026, 5);
    expect(hidden.tiebreakers.find((row) => row.userId === dylan)).toMatchObject({
      visibility: "hidden",
      prediction: null,
    });
    const after = createLeagueService(store, () => new Date("2026-10-06T00:16:00.000Z"));
    const revealed = await after.getPickBoard(john, leagueId, 2026, 5);
    expect(revealed.tiebreakers.find((row) => row.userId === dylan)?.prediction).toBe(47);
  });
});

describe("weekly scoring", () => {
  const finalGame = (id: string, winner: string, kickoff: string, monday = false): NflGame =>
    game({
      id,
      kickoffAt: kickoff,
      status: "final",
      awayScore: winner === "PHI" || winner === "KC" || winner === "ATL" ? 24 : 17,
      homeScore: winner === "PHI" || winner === "KC" || winner === "ATL" ? 20 : 24,
      winnerTeam: winner,
      isMondayGame: monday,
      awayTeamAbbreviation: monday ? "ATL" : id.endsWith("2") ? "KC" : "PHI",
      homeTeamAbbreviation: monday ? "NO" : id.endsWith("2") ? "LV" : "DAL",
      awayTeam: monday ? "Atlanta Falcons" : "Away",
      homeTeam: monday ? "New Orleans Saints" : "Home",
    });

  it("awards one point for a correct pick, zero for a wrong pick, and zero for no pick", () => {
    const games = [
      finalGame("g1", "PHI", "2026-10-02T00:15:00.000Z"),
      finalGame("g2", "KC", "2026-10-04T17:00:00.000Z"),
      finalGame("g3", "DAL", "2026-10-04T20:25:00.000Z"),
    ];
    games[2].awayTeamAbbreviation = "GB";
    games[2].homeTeamAbbreviation = "DAL";
    games[2].winnerTeam = "DAL";
    games[2].awayScore = 10;
    games[2].homeScore = 22;
    const rows = scoreWeek({
      games,
      userIds: [dylan, john, alex],
      picks: [
        { userId: dylan, gameId: "g1", selectedTeam: "PHI" },
        { userId: john, gameId: "g1", selectedTeam: "DAL" },
        { userId: alex, gameId: "g2", selectedTeam: "KC" },
      ],
      predictions: [],
      tiebreakerGame: null,
    });
    const byUser = Object.fromEntries(rows.map((row) => [row.userId, row]));
    expect(byUser[dylan].correctPicks).toBe(1);
    expect(byUser[john].correctPicks).toBe(0);
    expect(byUser[john].incorrectPicks).toBe(1);
    expect(byUser[john].missedPicks).toBe(2);
    expect(byUser[alex].correctPicks).toBe(1);
    expect(byUser[alex].missedPicks).toBe(2);
  });

  it("does not count a team pick as correct when the game ends tied", () => {
    const tied = game({
      id: "tie",
      status: "final",
      awayScore: 20,
      homeScore: 20,
      winnerTeam: null,
    });
    const rows = scoreWeek({
      games: [tied],
      userIds: [dylan],
      picks: [{ userId: dylan, gameId: tied.id, selectedTeam: "PHI" }],
      predictions: [],
      tiebreakerGame: null,
    });
    expect(rows[0].correctPicks).toBe(0);
    expect(rows[0].incorrectPicks).toBe(1);
    expect(rows[0].eligiblePicks).toBe(1);
  });

  it("leaves cancelled games out of the denominator", () => {
    const cancelled = game({ id: "x", status: "cancelled" });
    const rows = scoreWeek({
      games: [cancelled],
      userIds: [dylan],
      picks: [],
      predictions: [],
      tiebreakerGame: null,
    });
    expect(rows[0].eligiblePicks).toBe(0);
    expect(rows[0].isWinner).toBe(false);
  });

  it("calculates Monday tiebreaker error as the absolute difference", () => {
    expect(tiebreakerError(47, 44)).toBe(3);
    expect(tiebreakerError(null, 44)).toBeNull();
  });

  it("ranks the week by most correct picks", () => {
    const games = [finalGame("g1", "PHI", "2026-10-02T00:15:00.000Z")];
    const rows = scoreWeek({
      games,
      userIds: [dylan, john],
      picks: [
        { userId: dylan, gameId: "g1", selectedTeam: "PHI" },
        { userId: john, gameId: "g1", selectedTeam: "DAL" },
      ],
      predictions: [
        { userId: dylan, prediction: 10 },
        { userId: john, prediction: 44 },
      ],
      tiebreakerGame: finalGame("mnf", "ATL", "2026-10-06T00:15:00.000Z", true),
    });
    expect(rows.find((row) => row.userId === dylan)?.isWinner).toBe(true);
    expect(rows.find((row) => row.userId === john)?.isWinner).toBe(false);
    expect(rows.filter((row) => row.isWinner)).toHaveLength(1);
  });

  it("uses the Monday total when correct picks are tied", () => {
    const games = [
      finalGame("g1", "PHI", "2026-10-02T00:15:00.000Z"),
      finalGame("mnf", "ATL", "2026-10-06T00:15:00.000Z", true),
    ];
    games[1].awayScore = 27;
    games[1].homeScore = 24;
    games[1].winnerTeam = "ATL";
    const rows = scoreWeek({
      games,
      userIds: [dylan, john],
      picks: [
        { userId: dylan, gameId: "g1", selectedTeam: "PHI" },
        { userId: dylan, gameId: "mnf", selectedTeam: "ATL" },
        { userId: john, gameId: "g1", selectedTeam: "PHI" },
        { userId: john, gameId: "mnf", selectedTeam: "ATL" },
      ],
      predictions: [
        { userId: dylan, prediction: 49 },
        { userId: john, prediction: 56 },
      ],
      tiebreakerGame: games[1],
    });
    expect(tiebreakerError(49, 51)).toBe(2);
    expect(tiebreakerError(56, 51)).toBe(5);
    expect(rows.find((row) => row.userId === dylan)).toMatchObject({
      correctPicks: 2,
      tiebreakerError: 2,
      isWinner: true,
    });
    expect(rows.find((row) => row.userId === john)?.isWinner).toBe(false);
  });

  it("leaves an exact tie as co-winners", () => {
    const games = [
      finalGame("g1", "PHI", "2026-10-02T00:15:00.000Z"),
      finalGame("mnf", "ATL", "2026-10-06T00:15:00.000Z", true),
    ];
    games[1].awayScore = 24;
    games[1].homeScore = 27;
    const rows = scoreWeek({
      games,
      userIds: [dylan, john],
      picks: [
        { userId: dylan, gameId: "g1", selectedTeam: "PHI" },
        { userId: john, gameId: "g1", selectedTeam: "PHI" },
      ],
      predictions: [
        { userId: dylan, prediction: 49 },
        { userId: john, prediction: 53 },
      ],
      tiebreakerGame: games[1],
    });
    expect(rows.every((row) => row.tiebreakerError === 2)).toBe(true);
    expect(rows.filter((row) => row.isWinner).map((row) => row.userId).sort()).toEqual([
      dylan,
      john,
    ]);
  });

  it("chooses the last Monday game as the default tiebreaker", () => {
    const early = game({
      id: "early",
      kickoffAt: "2026-10-05T17:00:00.000Z",
      isMondayGame: true,
    });
    const late = game({
      id: "late",
      kickoffAt: "2026-10-06T00:15:00.000Z",
      isMondayGame: true,
    });
    expect(defaultTiebreakerGame([early, late])?.id).toBe("late");
  });
});

describe("commissioner actions and access", () => {
  it("blocks a non-commissioner from overriding a pick and writes no audit row", async () => {
    const slate = game({ status: "final", winnerTeam: "PHI", awayScore: 24, homeScore: 17 });
    const store = await leagueWith([slate]);
    await store.upsertPick({
      id: "pick-1",
      leagueId,
      season: 2026,
      week: 5,
      userId: john,
      gameId: slate.id,
      selectedTeam: "DAL",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    const service = createLeagueService(store, () => new Date("2026-10-03T00:00:00.000Z"));
    await expect(
      service.overridePick(dylan, {
        leagueId,
        userId: john,
        gameId: slate.id,
        selectedTeam: "PHI",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await store.listAudit(leagueId)).toHaveLength(0);
    expect((await store.getPick(leagueId, john, slate.id))?.selectedTeam).toBe("DAL");
  });

  it("records an audit entry and a league notification when the commissioner edits a pick", async () => {
    const slate = game({
      status: "final",
      winnerTeam: "PHI",
      awayScore: 24,
      homeScore: 17,
      awayTeam: "Philadelphia Eagles",
      homeTeam: "Dallas Cowboys",
    });
    const store = await leagueWith([slate]);
    await store.upsertPick({
      id: "pick-1",
      leagueId,
      season: 2026,
      week: 5,
      userId: john,
      gameId: slate.id,
      selectedTeam: "DAL",
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-01T00:00:00.000Z",
    });
    const service = createLeagueService(store, () => new Date("2026-10-03T00:00:00.000Z"));
    await service.overridePick(alex, {
      leagueId,
      userId: john,
      gameId: slate.id,
      selectedTeam: "PHI",
      reason: "Texted in before kickoff",
    });
    const audit = await store.listAudit(leagueId);
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actionType: "pick_override",
      actorUserId: alex,
      affectedUserId: john,
      previousValue: { selectedTeam: "DAL" },
      newValue: { selectedTeam: "PHI", gameId: slate.id },
      reason: "Texted in before kickoff",
    });
    const notes = await store.listNotifications(leagueId, 10);
    expect(notes[0].body).toContain("DAL");
    expect(notes[0].body).toContain("PHI");
    expect(notes[0].body).toContain("John");
  });

  it("stops outsiders from reading league picks, chat, and the board", async () => {
    const slate = game();
    const store = await leagueWith([slate]);
    const service = createLeagueService(store, () => new Date("2026-10-01T00:00:00.000Z"));
    await expect(service.getPickBoard(outsider, leagueId, 2026, 5)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(service.listMessages(outsider, leagueId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(service.getHome(outsider, leagueId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(service.getLeaderboard(outsider, leagueId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("time and schedule sync", () => {
  it("converts a Monday night Eastern kickoff to the right UTC instant", () => {
    const kickoff = zonedDateTimeToUtc("America/New_York", 2026, 10, 5, 20, 15);
    expect(kickoff.toISOString()).toBe("2026-10-06T00:15:00.000Z");
    expect(isMondayKickoff(kickoff.toISOString())).toBe(true);
    expect(isMondayKickoff("2026-10-04T17:00:00.000Z")).toBe(false);
  });

  it("does not overwrite a stored final score during sync", async () => {
    const stored = game({
      providerGameId: "espn-1",
      status: "final",
      awayScore: 24,
      homeScore: 20,
      winnerTeam: "PHI",
    });
    const store = await leagueWith([stored]);
    const incoming: ProviderGame = {
      providerGameId: "espn-1",
      season: 2026,
      week: 5,
      awayTeam: stored.awayTeam,
      awayTeamAbbreviation: "PHI",
      homeTeam: stored.homeTeam,
      homeTeamAbbreviation: "DAL",
      kickoffAt: stored.kickoffAt,
      status: "final",
      awayScore: 30,
      homeScore: 27,
      winnerTeam: "PHI",
      isMondayGame: false,
    };
    const result = await syncSeasonFromProvider({
      store,
      season: 2026,
      now: new Date("2026-10-06T12:00:00.000Z"),
      provider: {
        async getSeasonSchedule() {
          return [incoming];
        },
        async getWeekSchedule() {
          return [incoming];
        },
        async getGame() {
          return incoming;
        },
        async getGameResults() {
          return [incoming];
        },
      },
    });
    expect(result.skippedFinalChanges).toBe(1);
    expect((await store.getGame(stored.id))?.awayScore).toBe(24);
  });

  it("parses a regular-season ESPN event and ignores preseason", () => {
    const games = parseEspnScoreboard(
      {
        events: [
          {
            id: "401772510",
            date: "2026-10-06T00:20:00.000Z",
            season: { year: 2026, type: 2 },
            week: { number: 5 },
            competitions: [
              {
                status: { type: { name: "STATUS_FINAL" } },
                competitors: [
                  {
                    homeAway: "away",
                    score: "24",
                    team: { abbreviation: "ATL", displayName: "Atlanta Falcons" },
                  },
                  {
                    homeAway: "home",
                    score: "20",
                    team: { abbreviation: "NO", displayName: "New Orleans Saints" },
                  },
                ],
              },
            ],
          },
          {
            id: "preseason",
            date: "2026-08-10T00:00:00.000Z",
            season: { year: 2026, type: 1 },
            week: { number: 1 },
            competitions: [
              {
                competitors: [
                  { homeAway: "away", team: { abbreviation: "PHI", displayName: "Philadelphia Eagles" } },
                  { homeAway: "home", team: { abbreviation: "DAL", displayName: "Dallas Cowboys" } },
                ],
              },
            ],
          },
        ],
      },
      2026,
      5,
    );
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({
      providerGameId: "401772510",
      week: 5,
      winnerTeam: "ATL",
      awayScore: 24,
      homeScore: 20,
      isMondayGame: true,
    });
  });
});
