import type { Database } from "@/lib/db/types";
import { hashPassword } from "@/lib/auth/password";
import {
  etKickoff,
  nflThursdayOf,
  seasonWeekNumber,
} from "@/lib/domain/time";
import type {
  AuditEntry,
  LeagueMessage,
  LeagueNotification,
  NflGame,
  Pick,
  TiebreakerEntry,
} from "@/lib/domain/types";

export const DEMO_PASSWORD = "pickem-demo";
export const DEMO_INVITE_CODE = "K7R9Q2";

export const demoIds = {
  alex: "11111111-1111-4111-8111-000000000001",
  dylan: "11111111-1111-4111-8111-000000000002",
  john: "11111111-1111-4111-8111-000000000003",
  mike: "11111111-1111-4111-8111-000000000004",
  sam: "11111111-1111-4111-8111-000000000005",
  riley: "11111111-1111-4111-8111-000000000006",
  league: "22222222-2222-4222-8222-000000000001",
} as const;

const people = [
  [demoIds.alex, "Alex Rivera", "alex@sunday-sheet.test"],
  [demoIds.dylan, "Dylan Brooks", "dylan@sunday-sheet.test"],
  [demoIds.john, "John Patel", "john@sunday-sheet.test"],
  [demoIds.mike, "Mike Chen", "mike@sunday-sheet.test"],
  [demoIds.sam, "Sam Ortiz", "sam@sunday-sheet.test"],
  [demoIds.riley, "Riley Nguyen", "riley@sunday-sheet.test"],
] as const;

type Side = { city: string; name: string; abbr: string };

function team(city: string, name: string, abbr: string): Side {
  return { city, name, abbr };
}

function addDays(
  thursday: { year: number; month: number; day: number },
  days: number,
) {
  const shifted = new Date(Date.UTC(thursday.year, thursday.month - 1, thursday.day + days));
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function makeGame(input: {
  id: string;
  season: number;
  week: number;
  thursday: { year: number; month: number; day: number };
  dayOffset: number;
  hour: number;
  minute: number;
  away: Side;
  home: Side;
  monday?: boolean;
  now: Date;
  finalScore?: [number, number];
  liveScore?: [number, number];
}): NflGame {
  const kickoffAt = etKickoff(input.thursday, input.dayOffset, input.hour, input.minute);
  const kickoff = new Date(kickoffAt).getTime();
  const age = input.now.getTime() - kickoff;
  let status: NflGame["status"] = "scheduled";
  let awayScore: number | null = null;
  let homeScore: number | null = null;
  let winnerTeam: string | null = null;
  if (age >= 4 * 60 * 60 * 1000) {
    status = "final";
    const score = input.finalScore ?? [24, 17];
    awayScore = score[0];
    homeScore = score[1];
    winnerTeam =
      score[0] === score[1]
        ? null
        : score[0] > score[1]
          ? input.away.abbr
          : input.home.abbr;
  } else if (age >= 0) {
    status = "live";
    const score = input.liveScore ?? [10, 7];
    awayScore = score[0];
    homeScore = score[1];
  }
  return {
    id: input.id,
    providerGameId: `seed-${input.id}`,
    season: input.season,
    week: input.week,
    awayTeam: `${input.away.city} ${input.away.name}`,
    awayTeamAbbreviation: input.away.abbr,
    homeTeam: `${input.home.city} ${input.home.name}`,
    homeTeamAbbreviation: input.home.abbr,
    kickoffAt,
    status,
    awayScore,
    homeScore,
    winnerTeam,
    isMondayGame: input.monday ?? false,
    createdAt: input.now.toISOString(),
    updatedAt: input.now.toISOString(),
  };
}

function pick(
  leagueId: string,
  userId: string,
  game: NflGame,
  selectedTeam: string,
  now: Date,
): Pick {
  return {
    id: crypto.randomUUID(),
    leagueId,
    season: game.season,
    week: game.week,
    userId,
    gameId: game.id,
    selectedTeam,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

function guess(
  leagueId: string,
  userId: string,
  game: NflGame,
  prediction: number,
  now: Date,
): TiebreakerEntry {
  return {
    id: crypto.randomUUID(),
    leagueId,
    season: game.season,
    week: game.week,
    userId,
    prediction,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export async function buildDemoDatabase(now: Date): Promise<Database> {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const createdAt = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const thursday = nflThursdayOf(now);
  const season = thursday.month <= 2 ? thursday.year - 1 : thursday.year;
  const currentWeek = seasonWeekNumber(thursday);
  const leagueId = demoIds.league;

  const profiles = people.map(([id, displayName, email]) => ({
    id,
    displayName,
    email,
    avatarUrl: null,
    createdAt,
  }));

  const games: NflGame[] = [];
  const picks: Pick[] = [];
  const tiebreakers: TiebreakerEntry[] = [];

  if (currentWeek >= 3) {
    const weekNumber = currentWeek - 2;
    const anchor = addDays(thursday, -14);
    const slate = [
      makeGame({
        id: "33333333-3333-4333-8333-000000000201",
        season,
        week: weekNumber,
        thursday: anchor,
        dayOffset: 3,
        hour: 13,
        minute: 0,
        away: team("Los Angeles", "Rams", "LAR"),
        home: team("San Francisco", "49ers", "SF"),
        now,
        finalScore: [17, 27],
      }),
      makeGame({
        id: "33333333-3333-4333-8333-000000000202",
        season,
        week: weekNumber,
        thursday: anchor,
        dayOffset: 3,
        hour: 13,
        minute: 0,
        away: team("Dallas", "Cowboys", "DAL"),
        home: team("New York", "Giants", "NYG"),
        now,
        finalScore: [24, 10],
      }),
      makeGame({
        id: "33333333-3333-4333-8333-000000000203",
        season,
        week: weekNumber,
        thursday: anchor,
        dayOffset: 3,
        hour: 16,
        minute: 25,
        away: team("Miami", "Dolphins", "MIA"),
        home: team("Buffalo", "Bills", "BUF"),
        now,
        finalScore: [14, 31],
      }),
      makeGame({
        id: "33333333-3333-4333-8333-000000000204",
        season,
        week: weekNumber,
        thursday: anchor,
        dayOffset: 4,
        hour: 20,
        minute: 15,
        away: team("Seattle", "Seahawks", "SEA"),
        home: team("Arizona", "Cardinals", "ARI"),
        monday: true,
        now,
        finalScore: [20, 17],
      }),
    ];
    // Force final — these kickoffs are two weeks ago.
    for (const game of slate) {
      game.status = "final";
    }
    games.push(...slate);
    const [g1, g2, g3, g4] = slate;
    const choices: Record<string, [string, string, string, string, number]> = {
      [demoIds.dylan]: ["SF", "DAL", "BUF", "ARI", 40],
      [demoIds.john]: ["SF", "NYG", "BUF", "SEA", 34],
      [demoIds.mike]: ["LAR", "DAL", "MIA", "SEA", 44],
      [demoIds.alex]: ["SF", "NYG", "MIA", "SEA", 37],
      [demoIds.sam]: ["LAR", "DAL", "BUF", "ARI", 28],
      [demoIds.riley]: ["SF", "NYG", "MIA", "SEA", 45],
    };
    for (const [userId, choice] of Object.entries(choices)) {
      picks.push(
        pick(leagueId, userId, g1, choice[0], now),
        pick(leagueId, userId, g2, choice[1], now),
        pick(leagueId, userId, g3, choice[2], now),
        pick(leagueId, userId, g4, choice[3], now),
      );
      tiebreakers.push(guess(leagueId, userId, g4, choice[4], now));
    }
  }

  if (currentWeek >= 2) {
    const weekNumber = currentWeek - 1;
    const anchor = addDays(thursday, -7);
    const slate = [
      makeGame({
        id: "33333333-3333-4333-8333-000000000101",
        season,
        week: weekNumber,
        thursday: anchor,
        dayOffset: 0,
        hour: 20,
        minute: 15,
        away: team("New York", "Jets", "NYJ"),
        home: team("New England", "Patriots", "NE"),
        now,
        finalScore: [13, 21],
      }),
      makeGame({
        id: "33333333-3333-4333-8333-000000000102",
        season,
        week: weekNumber,
        thursday: anchor,
        dayOffset: 3,
        hour: 13,
        minute: 0,
        away: team("Minnesota", "Vikings", "MIN"),
        home: team("Detroit", "Lions", "DET"),
        now,
        finalScore: [17, 30],
      }),
      makeGame({
        id: "33333333-3333-4333-8333-000000000103",
        season,
        week: weekNumber,
        thursday: anchor,
        dayOffset: 3,
        hour: 16,
        minute: 5,
        away: team("Denver", "Broncos", "DEN"),
        home: team("Los Angeles", "Chargers", "LAC"),
        now,
        finalScore: [27, 20],
      }),
      makeGame({
        id: "33333333-3333-4333-8333-000000000104",
        season,
        week: weekNumber,
        thursday: anchor,
        dayOffset: 3,
        hour: 16,
        minute: 25,
        away: team("Tampa Bay", "Buccaneers", "TB"),
        home: team("Atlanta", "Falcons", "ATL"),
        now,
        finalScore: [23, 16],
      }),
      makeGame({
        id: "33333333-3333-4333-8333-000000000105",
        season,
        week: weekNumber,
        thursday: anchor,
        dayOffset: 3,
        hour: 20,
        minute: 20,
        away: team("Houston", "Texans", "HOU"),
        home: team("Jacksonville", "Jaguars", "JAX"),
        now,
        finalScore: [24, 21],
      }),
      makeGame({
        id: "33333333-3333-4333-8333-000000000106",
        season,
        week: weekNumber,
        thursday: anchor,
        dayOffset: 4,
        hour: 20,
        minute: 15,
        away: team("Cleveland", "Browns", "CLE"),
        home: team("Pittsburgh", "Steelers", "PIT"),
        monday: true,
        now,
        finalScore: [17, 24],
      }),
    ];
    for (const game of slate) game.status = "final";
    games.push(...slate);
    const winners = slate.map((game) => game.winnerTeam ?? game.homeTeamAbbreviation);
    const sheets: Record<string, { teams: string[]; total: number }> = {
      [demoIds.dylan]: { teams: [...winners], total: 44 },
      [demoIds.john]: {
        teams: [slate[0].awayTeamAbbreviation, ...winners.slice(1)],
        total: 41,
      },
      [demoIds.mike]: {
        teams: [
          slate[0].awayTeamAbbreviation,
          winners[1],
          slate[2].homeTeamAbbreviation,
          winners[3],
          winners[4],
          winners[5],
        ],
        total: 51,
      },
      [demoIds.alex]: {
        teams: [slate[0].awayTeamAbbreviation, ...winners.slice(1)],
        total: 38,
      },
      [demoIds.sam]: {
        teams: [winners[0], slate[1].awayTeamAbbreviation, winners[2], winners[3], slate[4].homeTeamAbbreviation, winners[5]],
        total: 33,
      },
      [demoIds.riley]: {
        teams: winners.map((winner, index) => (index % 2 === 0 ? slate[index].awayTeamAbbreviation : winner)),
        total: 48,
      },
    };
    for (const [userId, sheet] of Object.entries(sheets)) {
      slate.forEach((game, index) => {
        picks.push(pick(leagueId, userId, game, sheet.teams[index], now));
      });
      tiebreakers.push(guess(leagueId, userId, slate[5], sheet.total, now));
    }
  }

  const current = [
    makeGame({
      id: "33333333-3333-4333-8333-000000000001",
      season,
      week: currentWeek,
      thursday,
      dayOffset: 0,
      hour: 20,
      minute: 15,
      away: team("Philadelphia", "Eagles", "PHI"),
      home: team("Dallas", "Cowboys", "DAL"),
      now,
      finalScore: [24, 20],
    }),
    makeGame({
      id: "33333333-3333-4333-8333-000000000002",
      season,
      week: currentWeek,
      thursday,
      dayOffset: 2,
      hour: 9,
      minute: 30,
      away: team("Jacksonville", "Jaguars", "JAX"),
      home: team("Buffalo", "Bills", "BUF"),
      now,
      finalScore: [16, 19],
      liveScore: [9, 13],
    }),
    makeGame({
      id: "33333333-3333-4333-8333-000000000003",
      season,
      week: currentWeek,
      thursday,
      dayOffset: 3,
      hour: 13,
      minute: 0,
      away: team("Kansas City", "Chiefs", "KC"),
      home: team("Las Vegas", "Raiders", "LV"),
      now,
      finalScore: [27, 17],
    }),
    makeGame({
      id: "33333333-3333-4333-8333-000000000004",
      season,
      week: currentWeek,
      thursday,
      dayOffset: 3,
      hour: 13,
      minute: 0,
      away: team("Green Bay", "Packers", "GB"),
      home: team("Minnesota", "Vikings", "MIN"),
      now,
      finalScore: [21, 24],
    }),
    makeGame({
      id: "33333333-3333-4333-8333-000000000005",
      season,
      week: currentWeek,
      thursday,
      dayOffset: 3,
      hour: 16,
      minute: 25,
      away: team("San Francisco", "49ers", "SF"),
      home: team("Seattle", "Seahawks", "SEA"),
      now,
      finalScore: [23, 20],
    }),
    makeGame({
      id: "33333333-3333-4333-8333-000000000006",
      season,
      week: currentWeek,
      thursday,
      dayOffset: 3,
      hour: 20,
      minute: 20,
      away: team("Baltimore", "Ravens", "BAL"),
      home: team("Cincinnati", "Bengals", "CIN"),
      now,
      finalScore: [27, 24],
    }),
    makeGame({
      id: "33333333-3333-4333-8333-000000000007",
      season,
      week: currentWeek,
      thursday,
      dayOffset: 4,
      hour: 13,
      minute: 0,
      away: team("Detroit", "Lions", "DET"),
      home: team("Los Angeles", "Rams", "LAR"),
      monday: true,
      now,
      finalScore: [28, 24],
    }),
    makeGame({
      id: "33333333-3333-4333-8333-000000000008",
      season,
      week: currentWeek,
      thursday,
      dayOffset: 4,
      hour: 20,
      minute: 15,
      away: team("Atlanta", "Falcons", "ATL"),
      home: team("New Orleans", "Saints", "NO"),
      monday: true,
      now,
      finalScore: [24, 20],
    }),
  ];
  games.push(...current);

  const early = current.filter((game) => game.status === "final" || game.status === "live");
  const later = current.filter((game) => game.status === "scheduled" || game.status === "postponed");
  const sheets: Record<string, { early: string[]; later: string[]; skipLater?: number; total: number }> = {
    [demoIds.dylan]: {
      early: early.map((game) => game.homeTeamAbbreviation),
      later: later.map((game) => game.awayTeamAbbreviation),
      skipLater: later.length - 1,
      total: 47,
    },
    [demoIds.john]: {
      early: early.map((game) => game.awayTeamAbbreviation),
      later: later.map((game) => game.homeTeamAbbreviation),
      total: 51,
    },
    [demoIds.mike]: {
      early: early.map((game, index) =>
        index % 2 === 0 ? game.awayTeamAbbreviation : game.homeTeamAbbreviation,
      ),
      later: later.map((game) => game.awayTeamAbbreviation),
      skipLater: 0,
      total: 44,
    },
    [demoIds.alex]: {
      early: early.map((game) => game.winnerTeam ?? game.homeTeamAbbreviation),
      later: later.map((game) => game.homeTeamAbbreviation),
      total: 42,
    },
    [demoIds.sam]: {
      early: early.map((game) => game.awayTeamAbbreviation),
      later: [],
      total: 39,
    },
    [demoIds.riley]: {
      early: early.slice(0, 1).map((game) => game.homeTeamAbbreviation),
      later: later.slice(0, 2).map((game) => game.awayTeamAbbreviation),
      total: 55,
    },
  };

  for (const [userId, sheet] of Object.entries(sheets)) {
    early.forEach((game, index) => {
      const selected = sheet.early[index];
      if (selected) picks.push(pick(leagueId, userId, game, selected, now));
    });
    later.forEach((game, index) => {
      if (sheet.skipLater === index) return;
      const selected = sheet.later[index];
      if (selected) picks.push(pick(leagueId, userId, game, selected, now));
    });
    const tieGame = current.find((game) => game.id.endsWith("00000008")) ?? current.at(-1)!;
    tiebreakers.push(guess(leagueId, userId, tieGame, sheet.total, now));
  }

  const mondayNight = current.find((game) => game.id.endsWith("00000008")) ?? null;
  const notifications: LeagueNotification[] = [
    {
      id: crypto.randomUUID(),
      leagueId,
      actorUserId: null,
      body: `Week ${currentWeek} picks are open.`,
      dedupeKey: `week-open-${season}-${currentWeek}`,
      createdAt: new Date(now.getTime() - 3 * 86_400_000).toISOString(),
    },
  ];
  if (currentWeek >= 2) {
    notifications.push(
      {
        id: crypto.randomUUID(),
        leagueId,
        actorUserId: null,
        body: `Week ${currentWeek - 1} is final.`,
        dedupeKey: `week-final-${season}-${currentWeek - 1}`,
        createdAt: new Date(now.getTime() - 4 * 86_400_000).toISOString(),
      },
      {
        id: crypto.randomUUID(),
        leagueId,
        actorUserId: null,
        body: `Dylan Brooks won Week ${currentWeek - 1}.`,
        dedupeKey: `week-winner-${season}-${currentWeek - 1}`,
        createdAt: new Date(now.getTime() - 4 * 86_400_000 + 60_000).toISOString(),
      },
    );
  }
  if (current.some((game) => game.status !== "scheduled" && game.kickoffAt < now.toISOString())) {
    notifications.push({
      id: crypto.randomUUID(),
      leagueId,
      actorUserId: null,
      body: "This week's early games have started.",
      dedupeKey: `sunday-started-${season}-${currentWeek}`,
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
    });
  }

  const audit: AuditEntry[] = [];
  if (currentWeek >= 2) {
    const pastGame = games.find((game) => game.week === currentWeek - 1 && game.awayTeamAbbreviation === "NYJ");
    if (pastGame) {
      audit.push({
        id: crypto.randomUUID(),
        leagueId,
        actorUserId: demoIds.alex,
        affectedUserId: demoIds.sam,
        actionType: "pick_override",
        entityType: "pick",
        entityId: pastGame.id,
        previousValue: { selectedTeam: pastGame.awayTeamAbbreviation },
        newValue: { selectedTeam: pastGame.winnerTeam, gameId: pastGame.id },
        reason: "Sam texted the commissioner before kickoff and the app had already locked.",
        createdAt: new Date(now.getTime() - 6 * 86_400_000).toISOString(),
      });
      notifications.push({
        id: crypto.randomUUID(),
        leagueId,
        actorUserId: demoIds.alex,
        body: `Alex Rivera changed Sam Ortiz's Week ${currentWeek - 1} ${pastGame.awayTeamAbbreviation} @ ${pastGame.homeTeamAbbreviation} pick from ${pastGame.awayTeamAbbreviation} to ${pastGame.winnerTeam}.`,
        dedupeKey: null,
        createdAt: new Date(now.getTime() - 6 * 86_400_000).toISOString(),
      });
    }
  }

  const messages: LeagueMessage[] = [
    [demoIds.dylan, "Thursday felt straightforward. Sunday is the hard part."],
    [demoIds.john, "I'm not showing my card until those games kick."],
    [demoIds.alex, "Picks lock at kickoff. If I ever have to fix one, it shows up in the league log."],
    [demoIds.mike, "Who is brave enough to post a Monday total in here?"],
    [demoIds.riley, "I still owe two Sunday games. I'll get them in tomorrow."],
  ].map(([userId, message], index) => ({
    id: crypto.randomUUID(),
    leagueId,
    userId,
    message,
    createdAt: new Date(now.getTime() - (5 - index) * 60 * 60 * 1000).toISOString(),
  }));

  const tiebreakerGameId = mondayNight?.id ?? current.at(-1)?.id ?? null;

  return {
    profiles,
    passwordHashes: Object.fromEntries(people.map(([id]) => [id, passwordHash])),
    sessions: [],
    resetTokens: [],
    leagues: [
      {
        id: leagueId,
        name: "Sunday Sheet",
        inviteCode: DEMO_INVITE_CODE,
        commissionerUserId: demoIds.alex,
        seasonYear: season,
        timezone: "America/New_York",
        active: true,
        createdAt,
      },
    ],
    members: people.map(([id]) => ({
      leagueId,
      userId: id,
      role: id === demoIds.alex ? "commissioner" : "member",
      joinedAt: createdAt,
    })),
    games,
    leagueWeeks: [currentWeek - 2, currentWeek - 1, currentWeek]
      .filter((value) => value >= 1)
      .map((value) => ({
        id: crypto.randomUUID(),
        leagueId,
        season,
        week: value,
        tiebreakerGameId:
          games
            .filter((game) => game.week === value && game.isMondayGame)
            .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt))
            .at(-1)?.id ?? tiebreakerGameId,
      })),
    picks,
    tiebreakers,
    messages,
    notifications,
    audit,
    weeklyResults: [],
  };
}
