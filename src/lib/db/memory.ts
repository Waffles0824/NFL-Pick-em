import type { DataStore, Database } from "@/lib/db/types";
import { emptyDatabase } from "@/lib/db/types";
import { normalizeEmail, normalizeInviteCode } from "@/lib/domain/format";
import type {
  AuditEntry,
  League,
  LeagueMember,
  LeagueMessage,
  LeagueNotification,
  LeagueWeek,
  NflGame,
  Pick as GamePick,
  Profile,
  ResetTokenRecord,
  SessionRecord,
  TiebreakerEntry,
  WeeklyResult,
} from "@/lib/domain/types";

export class MemoryStore implements DataStore {
  readonly mode = "demo" as const;

  constructor(public data: Database = emptyDatabase()) {}

  async getProfile(id: string): Promise<Profile | null> {
    return this.data.profiles.find((profile) => profile.id === id) ?? null;
  }

  async getProfileByEmail(email: string): Promise<Profile | null> {
    const normalized = normalizeEmail(email);
    return (
      this.data.profiles.find((profile) => profile.email === normalized) ?? null
    );
  }

  async insertProfile(profile: Profile): Promise<void> {
    this.data.profiles.push(profile);
  }

  async updateProfile(
    id: string,
    patch: { displayName: string; avatarUrl?: string | null },
  ): Promise<void> {
    const profile = this.data.profiles.find((item) => item.id === id);
    if (!profile) return;
    profile.displayName = patch.displayName;
    if (patch.avatarUrl !== undefined) profile.avatarUrl = patch.avatarUrl;
  }

  async listProfilesByIds(ids: string[]): Promise<Profile[]> {
    const wanted = new Set(ids);
    return this.data.profiles.filter((profile) => wanted.has(profile.id));
  }

  async getPasswordHash(userId: string): Promise<string | null> {
    return this.data.passwordHashes[userId] ?? null;
  }

  async setPasswordHash(userId: string, hash: string): Promise<void> {
    this.data.passwordHashes[userId] = hash;
  }

  async createSession(session: SessionRecord): Promise<void> {
    this.data.sessions.push(session);
  }

  async getSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
    return this.data.sessions.find((session) => session.tokenHash === tokenHash) ?? null;
  }

  async deleteSessionsForUser(userId: string): Promise<void> {
    this.data.sessions = this.data.sessions.filter((session) => session.userId !== userId);
  }

  async saveResetToken(token: ResetTokenRecord): Promise<void> {
    this.data.resetTokens = this.data.resetTokens.filter(
      (item) => item.userId !== token.userId,
    );
    this.data.resetTokens.push(token);
  }

  async getResetToken(tokenHash: string): Promise<ResetTokenRecord | null> {
    return this.data.resetTokens.find((token) => token.tokenHash === tokenHash) ?? null;
  }

  async deleteResetToken(tokenHash: string): Promise<void> {
    this.data.resetTokens = this.data.resetTokens.filter(
      (token) => token.tokenHash !== tokenHash,
    );
  }

  async listLeagues(): Promise<League[]> {
    return [...this.data.leagues];
  }

  async listLeaguesForUser(userId: string): Promise<League[]> {
    const ids = new Set(
      this.data.members.filter((member) => member.userId === userId).map((m) => m.leagueId),
    );
    return this.data.leagues.filter((league) => ids.has(league.id) && league.active);
  }

  async getLeague(id: string): Promise<League | null> {
    return this.data.leagues.find((league) => league.id === id) ?? null;
  }

  async getLeagueByInviteCode(code: string): Promise<League | null> {
    const normalized = normalizeInviteCode(code);
    return (
      this.data.leagues.find((league) => league.inviteCode === normalized && league.active) ??
      null
    );
  }

  async insertLeague(league: League): Promise<void> {
    this.data.leagues.push(league);
  }

  async updateLeague(
    id: string,
    patch: Partial<Pick<League, "name" | "inviteCode" | "active">>,
  ): Promise<void> {
    const league = this.data.leagues.find((item) => item.id === id);
    if (!league) return;
    if (patch.name !== undefined) league.name = patch.name;
    if (patch.inviteCode !== undefined) league.inviteCode = patch.inviteCode;
    if (patch.active !== undefined) league.active = patch.active;
  }

  async listMembers(leagueId: string): Promise<LeagueMember[]> {
    return this.data.members.filter((member) => member.leagueId === leagueId);
  }

  async getMembership(leagueId: string, userId: string): Promise<LeagueMember | null> {
    return (
      this.data.members.find(
        (member) => member.leagueId === leagueId && member.userId === userId,
      ) ?? null
    );
  }

  async insertMember(member: LeagueMember): Promise<void> {
    const existing = await this.getMembership(member.leagueId, member.userId);
    if (existing) return;
    this.data.members.push(member);
  }

  async deleteMember(leagueId: string, userId: string): Promise<void> {
    this.data.members = this.data.members.filter(
      (member) => !(member.leagueId === leagueId && member.userId === userId),
    );
  }

  async listGames(season?: number): Promise<NflGame[]> {
    return this.data.games
      .filter((game) => season === undefined || game.season === season)
      .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));
  }

  async getGame(id: string): Promise<NflGame | null> {
    return this.data.games.find((game) => game.id === id) ?? null;
  }

  async upsertGames(games: NflGame[]): Promise<void> {
    for (const game of games) {
      const index = this.data.games.findIndex((item) => item.id === game.id);
      if (index === -1) this.data.games.push(game);
      else this.data.games[index] = game;
    }
  }

  async updateGame(id: string, patch: Partial<NflGame>): Promise<void> {
    const game = this.data.games.find((item) => item.id === id);
    if (!game) return;
    Object.assign(game, patch);
  }

  async listLeagueWeeks(leagueId: string): Promise<LeagueWeek[]> {
    return this.data.leagueWeeks.filter((week) => week.leagueId === leagueId);
  }

  async getLeagueWeek(
    leagueId: string,
    season: number,
    week: number,
  ): Promise<LeagueWeek | null> {
    return (
      this.data.leagueWeeks.find(
        (item) => item.leagueId === leagueId && item.season === season && item.week === week,
      ) ?? null
    );
  }

  async upsertLeagueWeek(week: LeagueWeek): Promise<void> {
    const index = this.data.leagueWeeks.findIndex(
      (item) =>
        item.leagueId === week.leagueId &&
        item.season === week.season &&
        item.week === week.week,
    );
    if (index === -1) this.data.leagueWeeks.push(week);
    else this.data.leagueWeeks[index] = { ...this.data.leagueWeeks[index], ...week };
  }

  async listPicks(leagueId: string, season: number, week: number): Promise<GamePick[]> {
    return this.data.picks.filter(
      (pick) => pick.leagueId === leagueId && pick.season === season && pick.week === week,
    );
  }

  async getPick(leagueId: string, userId: string, gameId: string): Promise<GamePick | null> {
    return (
      this.data.picks.find(
        (pick) =>
          pick.leagueId === leagueId && pick.userId === userId && pick.gameId === gameId,
      ) ?? null
    );
  }

  async readPickUnrestricted(
    leagueId: string,
    userId: string,
    gameId: string,
  ): Promise<GamePick | null> {
    return this.getPick(leagueId, userId, gameId);
  }

  async writePickUnrestricted(pick: GamePick): Promise<void> {
    await this.upsertPick(pick);
  }

  async upsertPick(pick: GamePick): Promise<void> {
    const index = this.data.picks.findIndex(
      (item) =>
        item.leagueId === pick.leagueId &&
        item.userId === pick.userId &&
        item.gameId === pick.gameId,
    );
    if (index === -1) this.data.picks.push(pick);
    else this.data.picks[index] = pick;
  }

  async listTiebreakers(
    leagueId: string,
    season: number,
    week: number,
  ): Promise<TiebreakerEntry[]> {
    return this.data.tiebreakers.filter(
      (entry) =>
        entry.leagueId === leagueId && entry.season === season && entry.week === week,
    );
  }

  async upsertTiebreaker(entry: TiebreakerEntry): Promise<void> {
    const index = this.data.tiebreakers.findIndex(
      (item) =>
        item.leagueId === entry.leagueId &&
        item.season === entry.season &&
        item.week === entry.week &&
        item.userId === entry.userId,
    );
    if (index === -1) this.data.tiebreakers.push(entry);
    else this.data.tiebreakers[index] = entry;
  }

  async listMessages(leagueId: string, limit: number): Promise<LeagueMessage[]> {
    return this.data.messages
      .filter((message) => message.leagueId === leagueId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(-limit);
  }

  async insertMessage(message: LeagueMessage): Promise<void> {
    this.data.messages.push(message);
  }

  async listNotifications(
    leagueId: string,
    limit: number,
  ): Promise<LeagueNotification[]> {
    return this.data.notifications
      .filter((notification) => notification.leagueId === leagueId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  async insertNotification(notification: LeagueNotification): Promise<boolean> {
    if (
      notification.dedupeKey &&
      this.data.notifications.some(
        (item) =>
          item.leagueId === notification.leagueId &&
          item.dedupeKey === notification.dedupeKey,
      )
    ) {
      return false;
    }
    this.data.notifications.push(notification);
    return true;
  }

  async listAudit(leagueId: string): Promise<AuditEntry[]> {
    return this.data.audit
      .filter((entry) => entry.leagueId === leagueId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async insertAudit(entry: AuditEntry): Promise<void> {
    this.data.audit.push(entry);
  }

  async listWeeklyResults(leagueId: string, season: number): Promise<WeeklyResult[]> {
    return this.data.weeklyResults.filter(
      (row) => row.leagueId === leagueId && row.season === season,
    );
  }

  async replaceWeeklyResults(
    leagueId: string,
    season: number,
    week: number,
    rows: WeeklyResult[],
  ): Promise<void> {
    this.data.weeklyResults = this.data.weeklyResults.filter(
      (row) => !(row.leagueId === leagueId && row.season === season && row.week === week),
    );
    this.data.weeklyResults.push(...rows);
  }

  async replaceAll(data: Database): Promise<void> {
    this.data = data;
  }

  async snapshot(): Promise<Database> {
    return structuredClone(this.data);
  }
}
