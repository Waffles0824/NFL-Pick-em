import type { DataStore } from "@/lib/db/types";
import { AppError } from "@/lib/domain/errors";
import {
  createInviteCode,
  normalizeInviteCode,
  validateDisplayName,
  validateLeagueName,
  validatePrediction,
} from "@/lib/domain/format";
import {
  combinedPoints,
  defaultTiebreakerGame,
  gradePick,
  isPickLocked,
  isWeekComplete,
  scoreWeek,
  tiebreakerError,
  tiebreakerWasNeeded,
  toWeeklyResults,
  winnerFromScores,
  pickPercentage,
  type ScoreRow,
} from "@/lib/domain/scoring";
import { currentSeasonYear, hasKickedOff } from "@/lib/domain/time";
import type {
  AuditView,
  BoardCell,
  BoardTiebreaker,
  CellResult,
  ChatMessage,
  GameStatus,
  InvitePreview,
  League,
  LeagueHome,
  LeagueRole,
  LeagueWeek,
  MemberProfile,
  NflGame,
  Pick,
  PickBoard,
  Profile,
  StandingRow,
  TiebreakerEntry,
} from "@/lib/domain/types";

export type LeagueService = ReturnType<typeof createLeagueService>;

export function createLeagueService(
  store: DataStore,
  now: () => Date = () => new Date(),
) {
  function stamp() {
    return now().toISOString();
  }

  async function requireProfile(userId: string): Promise<Profile> {
    const profile = await store.getProfile(userId);
    if (!profile) throw new AppError("Account not found.", "UNAUTHORIZED");
    return profile;
  }

  async function requireMember(userId: string, leagueId: string) {
    const league = await store.getLeague(leagueId);
    if (!league || !league.active) {
      throw new AppError("League not found.", "NOT_FOUND");
    }
    const membership = await store.getMembership(leagueId, userId);
    if (!membership) {
      throw new AppError("You are not in this league.", "FORBIDDEN");
    }
    return { league, membership };
  }

  async function requireCommissioner(userId: string, leagueId: string) {
    const context = await requireMember(userId, leagueId);
    if (context.membership.role !== "commissioner") {
      throw new AppError("Only the commissioner can do that.", "FORBIDDEN");
    }
    return context;
  }

  async function memberProfiles(leagueId: string): Promise<MemberProfile[]> {
    const members = await store.listMembers(leagueId);
    const profiles = await store.listProfilesByIds(members.map((member) => member.userId));
    const byId = new Map(profiles.map((profile) => [profile.id, profile]));
    return members
      .map((member) => {
        const profile = byId.get(member.userId);
        if (!profile) return null;
        return { ...member, profile };
      })
      .filter((member): member is MemberProfile => member !== null)
      .sort((a, b) => a.profile.displayName.localeCompare(b.profile.displayName));
  }

  async function ensureLeagueWeek(
    leagueId: string,
    season: number,
    week: number,
    games: NflGame[],
  ): Promise<LeagueWeek> {
    const existing = await store.getLeagueWeek(leagueId, season, week);
    const fallback = defaultTiebreakerGame(games);
    if (!existing) {
      const created: LeagueWeek = {
        id: crypto.randomUUID(),
        leagueId,
        season,
        week,
        tiebreakerGameId: fallback?.id ?? null,
      };
      await store.upsertLeagueWeek(created);
      return created;
    }
    if (!existing.tiebreakerGameId && fallback) {
      const updated = { ...existing, tiebreakerGameId: fallback.id };
      await store.upsertLeagueWeek(updated);
      return updated;
    }
    return existing;
  }

  async function notify(
    leagueId: string,
    body: string,
    actorUserId: string | null,
    dedupeKey: string | null,
  ) {
    await store.insertNotification({
      id: crypto.randomUUID(),
      leagueId,
      actorUserId,
      body,
      dedupeKey,
      createdAt: stamp(),
    });
  }

  async function audit(entry: Omit<AuditView, "actorName" | "affectedName" | "id" | "createdAt"> & {
    id?: string;
  }) {
    await store.insertAudit({
      id: entry.id ?? crypto.randomUUID(),
      createdAt: stamp(),
      leagueId: entry.leagueId,
      actorUserId: entry.actorUserId,
      affectedUserId: entry.affectedUserId,
      actionType: entry.actionType,
      entityType: entry.entityType,
      entityId: entry.entityId,
      previousValue: entry.previousValue,
      newValue: entry.newValue,
      reason: entry.reason,
    });
  }

  function scoreMembers(
    games: NflGame[],
    members: MemberProfile[],
    picks: Pick[],
    predictions: TiebreakerEntry[],
    tiebreakerGame: NflGame | null,
  ): ScoreRow[] {
    return scoreWeek({
      games,
      userIds: members.map((member) => member.userId),
      picks,
      predictions,
      tiebreakerGame,
    });
  }

  async function loadWeekBundle(leagueId: string, season: number, week: number) {
    const games = (await store.listGames(season)).filter((game) => game.week === week);
    const members = await memberProfiles(leagueId);
    const leagueWeek = await ensureLeagueWeek(leagueId, season, week, games);
    const tiebreakerGame =
      games.find((game) => game.id === leagueWeek.tiebreakerGameId) ??
      defaultTiebreakerGame(games);
    const picks = await store.listPicks(leagueId, season, week);
    const predictions = await store.listTiebreakers(leagueId, season, week);
    return { games, members, leagueWeek, tiebreakerGame, picks, predictions };
  }

  async function persistSnapshot(
    leagueId: string,
    season: number,
    week: number,
    rows: ScoreRow[],
  ) {
    await store.replaceWeeklyResults(
      leagueId,
      season,
      week,
      toWeeklyResults(leagueId, season, week, rows, () => crypto.randomUUID()),
    );
  }

  async function announceCompletedWeek(
    league: League,
    week: number,
    games: NflGame[],
    members: MemberProfile[],
    rows: ScoreRow[],
    tiebreakerGame: NflGame | null,
  ) {
    await notify(
      league.id,
      `Week ${week} is final.`,
      null,
      `week-final-${league.seasonYear}-${week}`,
    );
    const winners = rows.filter((row) => row.isWinner);
    const names = winners.map(
      (row) => members.find((member) => member.userId === row.userId)?.profile.displayName ?? "A member",
    );
    if (names.length === 1) {
      await notify(
        league.id,
        `${names[0]} won Week ${week}.`,
        null,
        `week-winner-${league.seasonYear}-${week}`,
      );
    } else if (names.length > 1) {
      await notify(
        league.id,
        `${formatNameList(names)} tied for the Week ${week} win.`,
        null,
        `week-winner-${league.seasonYear}-${week}`,
      );
    }
    const sunday = games.find((game) => gameGroupIsSunday(game));
    if (sunday && hasKickedOff(sunday.kickoffAt, now())) {
      await notify(
        league.id,
        "Sunday games have started.",
        null,
        `sunday-started-${league.seasonYear}-${week}`,
      );
    }
    void tiebreakerGame;
  }

  async function reconcileWeek(league: League, season: number, week: number) {
    const bundle = await loadWeekBundle(league.id, season, week);
    if (bundle.games.length === 0) return bundle;
    await notify(
      league.id,
      `Week ${week} picks are open.`,
      null,
      `week-open-${season}-${week}`,
    );
    const sundayStarted = bundle.games.some(
      (game) => gameGroupIsSunday(game) && hasKickedOff(game.kickoffAt, now()),
    );
    if (sundayStarted) {
      await notify(
        league.id,
        "Sunday games have started.",
        null,
        `sunday-started-${season}-${week}`,
      );
    }
    const existing = await store.listWeeklyResults(league.id, season);
    const alreadyFrozen = existing.some((row) => row.week === week);
    const complete = isWeekComplete(bundle.games);
    if (complete && !alreadyFrozen) {
      const rows = scoreMembers(
        bundle.games,
        bundle.members,
        bundle.picks,
        bundle.predictions,
        bundle.tiebreakerGame,
      );
      await persistSnapshot(league.id, season, week, rows);
      await announceCompletedWeek(
        league,
        week,
        bundle.games,
        bundle.members,
        rows,
        bundle.tiebreakerGame,
      );
    }
    return bundle;
  }

  async function rebuildWeek(leagueId: string, season: number, week: number) {
    const league = await store.getLeague(leagueId);
    if (!league) return;
    const bundle = await loadWeekBundle(leagueId, season, week);
    if (!isWeekComplete(bundle.games)) {
      await store.replaceWeeklyResults(leagueId, season, week, []);
      return;
    }
    const rows = scoreMembers(
      bundle.games,
      bundle.members,
      bundle.picks,
      bundle.predictions,
      bundle.tiebreakerGame,
    );
    await persistSnapshot(leagueId, season, week, rows);
  }

  function toStanding(row: ScoreRow, name: string, extras?: Partial<StandingRow>): StandingRow {
    return {
      userId: row.userId,
      displayName: name,
      correctPicks: row.correctPicks,
      eligiblePicks: row.eligiblePicks,
      incorrectPicks: row.incorrectPicks,
      missedPicks: row.missedPicks,
      tiebreakerPrediction: row.tiebreakerPrediction,
      tiebreakerActual: row.tiebreakerActual,
      tiebreakerError: row.tiebreakerError,
      isWinner: row.isWinner,
      weeklyWins: extras?.weeklyWins ?? 0,
      sharedWins: extras?.sharedWins ?? 0,
      pickPercentage: pickPercentage(row.correctPicks, row.eligiblePicks),
    };
  }

  function redactStandings(
    rows: StandingRow[],
    viewerId: string,
    tiebreakerGame: NflGame | null,
  ): StandingRow[] {
    const revealed =
      !tiebreakerGame || hasKickedOff(tiebreakerGame.kickoffAt, now());
    if (revealed) return rows;
    return rows.map((row) => {
      if (row.userId === viewerId) return row;
      return {
        ...row,
        tiebreakerPrediction: null,
        tiebreakerError: null,
      };
    });
  }

  function cellFor(
    viewerId: string,
    ownerId: string,
    game: NflGame,
    selectedTeam: string | null,
  ): BoardCell {
    const own = viewerId === ownerId;
    const visible = own || hasKickedOff(game.kickoffAt, now());
    if (!visible) {
      return {
        userId: ownerId,
        gameId: game.id,
        visibility: "hidden",
        selectedTeam: null,
        result: "hidden",
      };
    }
    const grade = gradePick(game, selectedTeam);
    let result: CellResult;
    if (game.status === "cancelled") result = "cancelled";
    else if (!selectedTeam && isPickLocked(game, now())) result = "no-pick";
    else if (!selectedTeam) result = "pending";
    else if (grade === "correct") result = "correct";
    else if (grade === "incorrect" || grade === "missed") result = "incorrect";
    else if (isPickLocked(game, now())) result = "locked";
    else result = "pending";
    return {
      userId: ownerId,
      gameId: game.id,
      visibility: own ? "own" : "revealed",
      selectedTeam,
      result,
    };
  }

  async function buildBoard(
    viewerId: string,
    league: League,
    role: LeagueRole,
    season: number,
    week: number,
  ): Promise<PickBoard> {
    await reconcileWeek(league, season, week);
    const bundle = await loadWeekBundle(league.id, season, week);
    const rows = scoreMembers(
      bundle.games,
      bundle.members,
      bundle.picks,
      bundle.predictions,
      bundle.tiebreakerGame,
    );
    const names = new Map(
      bundle.members.map((member) => [member.userId, member.profile.displayName]),
    );
    const revealedTie =
      !bundle.tiebreakerGame || hasKickedOff(bundle.tiebreakerGame.kickoffAt, now());
    const actual = bundle.tiebreakerGame ? combinedPoints(bundle.tiebreakerGame) : null;
    const cells: BoardCell[] = [];
    for (const member of bundle.members) {
      for (const game of bundle.games) {
        const pick = bundle.picks.find(
          (item) => item.userId === member.userId && item.gameId === game.id,
        );
        cells.push(cellFor(viewerId, member.userId, game, pick?.selectedTeam ?? null));
      }
    }
    const tiebreakers: BoardTiebreaker[] = bundle.members.map((member) => {
      const entry = bundle.predictions.find((item) => item.userId === member.userId);
      const own = member.userId === viewerId;
      if (!own && !revealedTie) {
        return {
          userId: member.userId,
          visibility: "hidden",
          prediction: null,
          error: null,
        };
      }
      return {
        userId: member.userId,
        visibility: own ? "own" : "revealed",
        prediction: entry?.prediction ?? null,
        error: tiebreakerError(entry?.prediction ?? null, actual),
      };
    });
    const standings = redactStandings(
      rows.map((row) => toStanding(row, names.get(row.userId) ?? "Member")),
      viewerId,
      bundle.tiebreakerGame,
    );
    return {
      league,
      season,
      week,
      role,
      viewerId,
      games: bundle.games,
      members: bundle.members,
      cells,
      tiebreakers,
      tiebreakerGame: bundle.tiebreakerGame,
      tiebreakerActual: actual,
      weekComplete: isWeekComplete(bundle.games),
      tiebreakerNeeded: tiebreakerWasNeeded(rows),
      standings,
    };
  }

  async function currentWeek(season: number): Promise<number> {
    const games = await store.listGames(season);
    if (games.length === 0) return 1;
    const weeks = [...new Set(games.map((game) => game.week))].sort((a, b) => a - b);
    for (const week of weeks) {
      const slate = games.filter((game) => game.week === week && game.status !== "cancelled");
      if (slate.length === 0) continue;
      if (!slate.every((game) => game.status === "final")) return week;
    }
    return weeks.at(-1) ?? 1;
  }

  return {
    async updateDisplayName(actorId: string, displayName: string) {
      const issue = validateDisplayName(displayName);
      if (issue) throw new AppError(issue, "VALIDATION");
      await requireProfile(actorId);
      await store.updateProfile(actorId, { displayName: displayName.trim() });
      const updated = await store.getProfile(actorId);
      if (!updated) throw new AppError("Account not found.", "NOT_FOUND");
      return updated;
    },

    async createLeague(actorId: string, name: string) {
      const issue = validateLeagueName(name);
      if (issue) throw new AppError(issue, "VALIDATION");
      await requireProfile(actorId);
      const season = currentSeasonYear(now());
      let inviteCode = createInviteCode();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const clash = await store.getLeagueByInviteCode(inviteCode);
        if (!clash) break;
        inviteCode = createInviteCode();
      }
      const league: League = {
        id: crypto.randomUUID(),
        name: name.trim(),
        inviteCode,
        commissionerUserId: actorId,
        seasonYear: season,
        timezone: "America/New_York",
        active: true,
        createdAt: stamp(),
      };
      await store.insertLeague(league);
      await store.insertMember({
        leagueId: league.id,
        userId: actorId,
        role: "commissioner",
        joinedAt: stamp(),
      });
      await notify(league.id, `${league.name} is open for picks.`, actorId, null);
      return league;
    },

    async previewInvite(inviteCode: string, actorId: string | null): Promise<InvitePreview | null> {
      const league = await store.getLeagueByInviteCode(normalizeInviteCode(inviteCode));
      if (!league) return null;
      const members = await store.listMembers(league.id);
      const alreadyMember = actorId
        ? members.some((member) => member.userId === actorId)
        : false;
      return {
        leagueId: league.id,
        name: league.name,
        seasonYear: league.seasonYear,
        memberCount: members.length,
        alreadyMember,
      };
    },

    async joinLeague(actorId: string, inviteCode: string) {
      const profile = await requireProfile(actorId);
      const league = await store.getLeagueByInviteCode(normalizeInviteCode(inviteCode));
      if (!league) throw new AppError("That invite code does not match a league.", "NOT_FOUND");
      const existing = await store.getMembership(league.id, actorId);
      if (existing) return league;
      await store.insertMember({
        leagueId: league.id,
        userId: actorId,
        role: "member",
        joinedAt: stamp(),
      });
      await notify(league.id, `${profile.displayName} joined the league.`, actorId, null);
      return league;
    },

    async listMyLeagues(actorId: string) {
      const leagues = await store.listLeaguesForUser(actorId);
      const cards = [];
      for (const league of leagues) {
        const members = await store.listMembers(league.id);
        const membership = members.find((member) => member.userId === actorId);
        cards.push({
          ...league,
          role: (membership?.role ?? "member") as LeagueRole,
          memberCount: members.length,
        });
      }
      return cards.sort((a, b) => a.name.localeCompare(b.name));
    },

    async getHome(actorId: string, leagueId: string): Promise<LeagueHome> {
      const { league, membership } = await requireMember(actorId, leagueId);
      const season = league.seasonYear;
      const week = await currentWeek(season);
      const board = await buildBoard(actorId, league, membership.role, season, week);
      const myPicksMade = board.cells.filter(
        (cell) => cell.userId === actorId && cell.selectedTeam,
      ).length;
      const nextGame =
        board.games.find(
          (game) =>
            !hasKickedOff(game.kickoffAt, now()) &&
            (game.status === "scheduled" || game.status === "postponed"),
        ) ?? null;
      let lastWeek: LeagueHome["lastWeek"] = null;
      if (week > 1) {
        const previousGames = (await store.listGames(season)).filter(
          (game) => game.week === week - 1,
        );
        if (previousGames.length > 0) {
          const previous = await buildBoard(
            actorId,
            league,
            membership.role,
            season,
            week - 1,
          );
          lastWeek = {
            week: week - 1,
            standings: previous.standings,
            tiebreakerNeeded: previous.tiebreakerNeeded,
            tiebreakerActual: previous.tiebreakerActual,
            tiebreakerGame: previous.tiebreakerGame,
            weekComplete: previous.weekComplete,
          };
        }
      }
      const notifications = await store.listNotifications(leagueId, 6);
      return {
        league,
        role: membership.role,
        season,
        week,
        games: board.games,
        myPicksMade,
        totalGames: board.games.filter((game) => game.status !== "cancelled").length,
        nextGame,
        liveStandings: board.standings,
        lastWeek,
        notifications,
        memberCount: board.members.length,
      };
    },

    async getPickBoard(actorId: string, leagueId: string, season: number, week: number) {
      const { league, membership } = await requireMember(actorId, leagueId);
      return buildBoard(actorId, league, membership.role, season, week);
    },

    async listWeeks(actorId: string, leagueId: string) {
      const { league } = await requireMember(actorId, leagueId);
      const games = await store.listGames(league.seasonYear);
      return [...new Set(games.map((game) => game.week))].sort((a, b) => a - b);
    },

    async listWeekSummaries(actorId: string, leagueId: string) {
      const { league, membership } = await requireMember(actorId, leagueId);
      const weeks = [...(await this.listWeeks(actorId, leagueId))].reverse();
      const summaries = [];
      for (const week of weeks) {
        const board = await buildBoard(actorId, league, membership.role, league.seasonYear, week);
        const leaders = [...board.standings].sort((a, b) => b.correctPicks - a.correctPicks);
        const winners = board.weekComplete ? board.standings.filter((row) => row.isWinner) : [];
        const sample = winners[0] ?? leaders[0];
        summaries.push({
          week,
          weekComplete: board.weekComplete,
          correctPicks: sample?.correctPicks ?? 0,
          eligiblePicks: sample?.eligiblePicks ?? 0,
          winners: winners.map((row) => ({
            displayName: row.displayName,
            pickPercentage: row.pickPercentage,
          })),
        });
      }
      return summaries;
    },

    async savePick(
      actorId: string,
      input: { leagueId: string; gameId: string; selectedTeam: string },
    ) {
      await requireMember(actorId, input.leagueId);
      const game = await store.getGame(input.gameId);
      if (!game) throw new AppError("Game not found.", "NOT_FOUND");
      if (game.status === "cancelled") {
        throw new AppError("This game was cancelled.", "VALIDATION");
      }
      if (isPickLocked(game, now())) {
        throw new AppError("This game locked at kickoff.", "LOCKED");
      }
      const teams = [game.awayTeamAbbreviation, game.homeTeamAbbreviation];
      if (!teams.includes(input.selectedTeam)) {
        throw new AppError("Pick one of the two teams in this game.", "VALIDATION");
      }
      const existing = await store.getPick(input.leagueId, actorId, game.id);
      const pick: Pick = {
        id: existing?.id ?? crypto.randomUUID(),
        leagueId: input.leagueId,
        season: game.season,
        week: game.week,
        userId: actorId,
        gameId: game.id,
        selectedTeam: input.selectedTeam,
        createdAt: existing?.createdAt ?? stamp(),
        updatedAt: stamp(),
      };
      await store.upsertPick(pick);
      return pick;
    },

    async saveTiebreaker(
      actorId: string,
      input: { leagueId: string; season: number; week: number; prediction: number },
    ) {
      const issue = validatePrediction(input.prediction);
      if (issue) throw new AppError(issue, "VALIDATION");
      const { league } = await requireMember(actorId, input.leagueId);
      const games = (await store.listGames(league.seasonYear)).filter(
        (game) => game.week === input.week,
      );
      const leagueWeek = await ensureLeagueWeek(input.leagueId, input.season, input.week, games);
      const tiebreaker =
        games.find((game) => game.id === leagueWeek.tiebreakerGameId) ??
        defaultTiebreakerGame(games);
      if (!tiebreaker) {
        throw new AppError("No Monday tiebreaker game is set for this week.", "VALIDATION");
      }
      if (hasKickedOff(tiebreaker.kickoffAt, now()) || isPickLocked(tiebreaker, now())) {
        throw new AppError("The Monday tiebreaker locked at kickoff.", "LOCKED");
      }
      const existing = (await store.listTiebreakers(input.leagueId, input.season, input.week)).find(
        (entry) => entry.userId === actorId,
      );
      const entry: TiebreakerEntry = {
        id: existing?.id ?? crypto.randomUUID(),
        leagueId: input.leagueId,
        season: input.season,
        week: input.week,
        userId: actorId,
        prediction: input.prediction,
        createdAt: existing?.createdAt ?? stamp(),
        updatedAt: stamp(),
      };
      await store.upsertTiebreaker(entry);
      return entry;
    },

    async getLeaderboard(actorId: string, leagueId: string) {
      const { league } = await requireMember(actorId, leagueId);
      const season = league.seasonYear;
      const games = await store.listGames(season);
      const weeks = [...new Set(games.map((game) => game.week))].sort((a, b) => a - b);
      const members = await memberProfiles(leagueId);
      const totals = new Map<
        string,
        { correct: number; eligible: number; wins: number; shared: number }
      >();
      for (const member of members) {
        totals.set(member.userId, { correct: 0, eligible: 0, wins: 0, shared: 0 });
      }
      for (const week of weeks) {
        const board = await buildBoard(actorId, league, "member", season, week);
        const winnerCount = board.standings.filter((row) => row.isWinner).length;
        for (const row of board.standings) {
          const total = totals.get(row.userId);
          if (!total) continue;
          total.correct += row.correctPicks;
          total.eligible += row.eligiblePicks;
          if (row.isWinner && board.weekComplete) {
            total.wins += 1;
            if (winnerCount > 1) total.shared += 1;
          }
        }
      }
      const rows: StandingRow[] = members
        .map((member) => {
          const total = totals.get(member.userId) ?? {
            correct: 0,
            eligible: 0,
            wins: 0,
            shared: 0,
          };
          return {
            userId: member.userId,
            displayName: member.profile.displayName,
            correctPicks: total.correct,
            eligiblePicks: total.eligible,
            incorrectPicks: 0,
            missedPicks: Math.max(0, total.eligible - total.correct),
            tiebreakerPrediction: null,
            tiebreakerActual: null,
            tiebreakerError: null,
            isWinner: false,
            weeklyWins: total.wins,
            sharedWins: total.shared,
            pickPercentage: pickPercentage(total.correct, total.eligible),
          };
        })
        .sort((a, b) => {
          if (b.weeklyWins !== a.weeklyWins) return b.weeklyWins - a.weeklyWins;
          if (b.pickPercentage !== a.pickPercentage) return b.pickPercentage - a.pickPercentage;
          if (b.correctPicks !== a.correctPicks) return b.correctPicks - a.correctPicks;
          return a.displayName.localeCompare(b.displayName);
        });
      return { league, season, rows };
    },

    async sendMessage(actorId: string, leagueId: string, message: string) {
      const { membership } = await requireMember(actorId, leagueId);
      void membership;
      const trimmed = message.trim();
      if (!trimmed) throw new AppError("Write a message first.", "VALIDATION");
      if (trimmed.length > 1000) {
        throw new AppError("Messages are limited to 1000 characters.", "VALIDATION");
      }
      const row = {
        id: crypto.randomUUID(),
        leagueId,
        userId: actorId,
        message: trimmed,
        createdAt: stamp(),
      };
      await store.insertMessage(row);
      return row;
    },

    async listMessages(actorId: string, leagueId: string): Promise<ChatMessage[]> {
      await requireMember(actorId, leagueId);
      const messages = await store.listMessages(leagueId, 200);
      const profiles = await store.listProfilesByIds(messages.map((message) => message.userId));
      const names = new Map(profiles.map((profile) => [profile.id, profile.displayName]));
      return messages.map((message) => ({
        ...message,
        displayName: names.get(message.userId) ?? "Member",
      }));
    },

    async listNotifications(actorId: string, leagueId: string) {
      await requireMember(actorId, leagueId);
      return store.listNotifications(leagueId, 50);
    },

    async listAudit(actorId: string, leagueId: string): Promise<AuditView[]> {
      await requireMember(actorId, leagueId);
      const entries = await store.listAudit(leagueId);
      const ids = entries.flatMap((entry) =>
        [entry.actorUserId, entry.affectedUserId].filter((id): id is string => Boolean(id)),
      );
      const profiles = await store.listProfilesByIds(ids);
      const names = new Map(profiles.map((profile) => [profile.id, profile.displayName]));
      return entries.map((entry) => ({
        ...entry,
        actorName: names.get(entry.actorUserId) ?? "Commissioner",
        affectedName: entry.affectedUserId
          ? (names.get(entry.affectedUserId) ?? "Member")
          : null,
      }));
    },

    async renameLeague(actorId: string, leagueId: string, name: string) {
      const issue = validateLeagueName(name);
      if (issue) throw new AppError(issue, "VALIDATION");
      const { league } = await requireCommissioner(actorId, leagueId);
      const previous = league.name;
      const next = name.trim();
      if (previous === next) return;
      await store.updateLeague(leagueId, { name: next });
      const actor = await requireProfile(actorId);
      await audit({
        leagueId,
        actorUserId: actorId,
        affectedUserId: null,
        actionType: "rename_league",
        entityType: "league",
        entityId: leagueId,
        previousValue: { name: previous },
        newValue: { name: next },
        reason: null,
      });
      await notify(leagueId, `${actor.displayName} renamed the league to ${next}.`, actorId, null);
    },

    async regenerateInvite(actorId: string, leagueId: string) {
      const { league } = await requireCommissioner(actorId, leagueId);
      const previous = league.inviteCode;
      let inviteCode = createInviteCode();
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const clash = await store.getLeagueByInviteCode(inviteCode);
        if (!clash || clash.id === leagueId) break;
        inviteCode = createInviteCode();
      }
      await store.updateLeague(leagueId, { inviteCode });
      const actor = await requireProfile(actorId);
      await audit({
        leagueId,
        actorUserId: actorId,
        affectedUserId: null,
        actionType: "regenerate_invite",
        entityType: "league",
        entityId: leagueId,
        previousValue: { inviteCode: previous },
        newValue: { inviteCode },
        reason: null,
      });
      await notify(leagueId, `${actor.displayName} replaced the league invite code.`, actorId, null);
      return inviteCode;
    },

    async removeMember(actorId: string, leagueId: string, userId: string) {
      await requireCommissioner(actorId, leagueId);
      if (actorId === userId) {
        throw new AppError("The commissioner cannot remove themselves.", "VALIDATION");
      }
      const target = await store.getMembership(leagueId, userId);
      if (!target) throw new AppError("That person is not in the league.", "NOT_FOUND");
      if (target.role === "commissioner") {
        throw new AppError("The commissioner cannot be removed.", "VALIDATION");
      }
      const actor = await requireProfile(actorId);
      const profile = await requireProfile(userId);
      await store.deleteMember(leagueId, userId);
      await audit({
        leagueId,
        actorUserId: actorId,
        affectedUserId: userId,
        actionType: "remove_member",
        entityType: "league_member",
        entityId: userId,
        previousValue: { role: target.role },
        newValue: null,
        reason: null,
      });
      await notify(
        leagueId,
        `${actor.displayName} removed ${profile.displayName} from the league.`,
        actorId,
        null,
      );
    },

    async leaveLeague(actorId: string, leagueId: string) {
      const { membership } = await requireMember(actorId, leagueId);
      if (membership.role === "commissioner") {
        throw new AppError("Transfer the league before the commissioner leaves.", "VALIDATION");
      }
      const profile = await requireProfile(actorId);
      await store.deleteMember(leagueId, actorId);
      await notify(leagueId, `${profile.displayName} left the league.`, actorId, null);
    },

    async setTiebreakerGame(
      actorId: string,
      leagueId: string,
      season: number,
      week: number,
      gameId: string,
    ) {
      const { league } = await requireCommissioner(actorId, leagueId);
      const games = (await store.listGames(league.seasonYear)).filter((game) => game.week === week);
      const leagueWeek = await ensureLeagueWeek(leagueId, season, week, games);
      const current =
        games.find((game) => game.id === leagueWeek.tiebreakerGameId) ?? null;
      if (current && hasKickedOff(current.kickoffAt, now())) {
        throw new AppError(
          "The designated Monday game has already kicked off.",
          "LOCKED",
        );
      }
      const next = games.find((game) => game.id === gameId);
      if (!next) throw new AppError("That game is not in this week.", "VALIDATION");
      if (hasKickedOff(next.kickoffAt, now())) {
        throw new AppError("Choose a game that has not kicked off.", "LOCKED");
      }
      if (current?.id === next.id) return;
      await store.upsertLeagueWeek({ ...leagueWeek, tiebreakerGameId: next.id });
      const actor = await requireProfile(actorId);
      await audit({
        leagueId,
        actorUserId: actorId,
        affectedUserId: null,
        actionType: "set_tiebreaker_game",
        entityType: "league_week",
        entityId: leagueWeek.id,
        previousValue: current
          ? { gameId: current.id, matchup: `${current.awayTeamAbbreviation}@${current.homeTeamAbbreviation}` }
          : null,
        newValue: {
          gameId: next.id,
          matchup: `${next.awayTeamAbbreviation}@${next.homeTeamAbbreviation}`,
        },
        reason: null,
      });
      await notify(
        leagueId,
        `${actor.displayName} set the Week ${week} tiebreaker game to ${next.awayTeamAbbreviation} @ ${next.homeTeamAbbreviation}.`,
        actorId,
        null,
      );
    },

    async commissionerViewPick(actorId: string, leagueId: string, userId: string, gameId: string) {
      await requireCommissioner(actorId, leagueId);
      const pick = await store.readPickUnrestricted(leagueId, userId, gameId);
      return pick?.selectedTeam ?? null;
    },

    async overridePick(
      actorId: string,
      input: {
        leagueId: string;
        userId: string;
        gameId: string;
        selectedTeam: string;
        reason?: string;
      },
    ) {
      await requireCommissioner(actorId, input.leagueId);
      const game = await store.getGame(input.gameId);
      if (!game) throw new AppError("Game not found.", "NOT_FOUND");
      if (game.status === "cancelled") {
        throw new AppError("This game was cancelled.", "VALIDATION");
      }
      const teams = [game.awayTeamAbbreviation, game.homeTeamAbbreviation];
      if (!teams.includes(input.selectedTeam)) {
        throw new AppError("Pick one of the two teams in this game.", "VALIDATION");
      }
      const targetMembership = await store.getMembership(input.leagueId, input.userId);
      if (!targetMembership) {
        throw new AppError("That person is not in the league.", "NOT_FOUND");
      }
      const existing = await store.readPickUnrestricted(input.leagueId, input.userId, game.id);
      if (existing?.selectedTeam === input.selectedTeam) return;
      const actor = await requireProfile(actorId);
      const target = await requireProfile(input.userId);
      const pick: Pick = {
        id: existing?.id ?? crypto.randomUUID(),
        leagueId: input.leagueId,
        season: game.season,
        week: game.week,
        userId: input.userId,
        gameId: game.id,
        selectedTeam: input.selectedTeam,
        createdAt: existing?.createdAt ?? stamp(),
        updatedAt: stamp(),
      };
      await store.writePickUnrestricted(pick);
      await audit({
        leagueId: input.leagueId,
        actorUserId: actorId,
        affectedUserId: input.userId,
        actionType: "pick_override",
        entityType: "pick",
        entityId: pick.id,
        previousValue: existing ? { selectedTeam: existing.selectedTeam } : null,
        newValue: { selectedTeam: input.selectedTeam, gameId: game.id },
        reason: input.reason?.trim() || null,
      });
      const matchup = `${game.awayTeamAbbreviation} @ ${game.homeTeamAbbreviation}`;
      const body = existing
        ? `${actor.displayName} changed ${target.displayName}'s Week ${game.week} ${matchup} pick from ${existing.selectedTeam} to ${input.selectedTeam}.`
        : `${actor.displayName} set ${target.displayName}'s Week ${game.week} ${matchup} pick to ${input.selectedTeam}.`;
      await notify(input.leagueId, body, actorId, null);
      await rebuildWeek(input.leagueId, game.season, game.week);
    },

    async correctResult(
      actorId: string,
      input: {
        leagueId: string;
        gameId: string;
        status: GameStatus;
        awayScore: number | null;
        homeScore: number | null;
        reason?: string;
      },
    ) {
      await requireCommissioner(actorId, input.leagueId);
      const game = await store.getGame(input.gameId);
      if (!game) throw new AppError("Game not found.", "NOT_FOUND");
      if (
        input.awayScore != null &&
        (!Number.isInteger(input.awayScore) || input.awayScore < 0)
      ) {
        throw new AppError("Scores must be whole numbers.", "VALIDATION");
      }
      if (
        input.homeScore != null &&
        (!Number.isInteger(input.homeScore) || input.homeScore < 0)
      ) {
        throw new AppError("Scores must be whole numbers.", "VALIDATION");
      }
      const winnerTeam = winnerFromScores(
        game,
        input.status,
        input.awayScore,
        input.homeScore,
      );
      const previous = {
        status: game.status,
        awayScore: game.awayScore,
        homeScore: game.homeScore,
        winnerTeam: game.winnerTeam,
      };
      await store.updateGame(game.id, {
        status: input.status,
        awayScore: input.awayScore,
        homeScore: input.homeScore,
        winnerTeam,
        updatedAt: stamp(),
      });
      const actor = await requireProfile(actorId);
      const matchup = `${game.awayTeamAbbreviation} @ ${game.homeTeamAbbreviation}`;
      const scoreText =
        input.status === "final" && input.awayScore != null && input.homeScore != null
          ? `${game.awayTeamAbbreviation} ${input.awayScore}, ${game.homeTeamAbbreviation} ${input.homeScore}`
          : input.status;
      const leagues = (await store.listLeagues()).filter(
        (league) => league.seasonYear === game.season && league.active,
      );
      for (const league of leagues) {
        await audit({
          leagueId: league.id,
          actorUserId: actorId,
          affectedUserId: null,
          actionType: "result_correction",
          entityType: "nfl_game",
          entityId: game.id,
          previousValue: previous,
          newValue: {
            status: input.status,
            awayScore: input.awayScore,
            homeScore: input.homeScore,
            winnerTeam,
          },
          reason: input.reason?.trim() || null,
        });
        await notify(
          league.id,
          `${actor.displayName} corrected the Week ${game.week} ${matchup} result to ${scoreText}.`,
          actorId,
          null,
        );
        await rebuildWeek(league.id, game.season, game.week);
      }
    },

    async syncSchedule(actorId: string, leagueId: string) {
      const { league } = await requireCommissioner(actorId, leagueId);
      const { syncSeasonFromProvider } = await import("@/lib/nfl/sync");
      const { espnProvider } = await import("@/lib/nfl/espn");
      try {
        const result = await syncSeasonFromProvider({
          store,
          provider: espnProvider,
          season: league.seasonYear,
          now: now(),
        });
        const actor = await requireProfile(actorId);
        await notify(
          leagueId,
          `${actor.displayName} synced the NFL schedule (${result.upserted} games).`,
          actorId,
          null,
        );
        return {
          message: `Synced ${result.upserted} games. Final scores already stored were left alone.`,
        };
      } catch (error) {
        const message =
          error instanceof AppError
            ? error.message
            : "The NFL schedule is temporarily unavailable. Try again in a few minutes.";
        throw new AppError(message, "UNAVAILABLE");
      }
    },
  };
}

function formatNameList(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

function gameGroupIsSunday(game: NflGame): boolean {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
  }).format(new Date(game.kickoffAt)) === "Sunday";
}
