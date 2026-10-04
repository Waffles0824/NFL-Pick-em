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

export type Database = {
  profiles: Profile[];
  passwordHashes: Record<string, string>;
  sessions: SessionRecord[];
  resetTokens: ResetTokenRecord[];
  leagues: League[];
  members: LeagueMember[];
  games: NflGame[];
  leagueWeeks: LeagueWeek[];
  picks: GamePick[];
  tiebreakers: TiebreakerEntry[];
  messages: LeagueMessage[];
  notifications: LeagueNotification[];
  audit: AuditEntry[];
  weeklyResults: WeeklyResult[];
};

export function emptyDatabase(): Database {
  return {
    profiles: [],
    passwordHashes: {},
    sessions: [],
    resetTokens: [],
    leagues: [],
    members: [],
    games: [],
    leagueWeeks: [],
    picks: [],
    tiebreakers: [],
    messages: [],
    notifications: [],
    audit: [],
    weeklyResults: [],
  };
}

export interface DataStore {
  readonly mode: "demo" | "supabase";

  getProfile(id: string): Promise<Profile | null>;
  getProfileByEmail(email: string): Promise<Profile | null>;
  insertProfile(profile: Profile): Promise<void>;
  updateProfile(
    id: string,
    patch: { displayName: string; avatarUrl?: string | null },
  ): Promise<void>;
  listProfilesByIds(ids: string[]): Promise<Profile[]>;

  getPasswordHash?(userId: string): Promise<string | null>;
  setPasswordHash?(userId: string, hash: string): Promise<void>;
  createSession?(session: SessionRecord): Promise<void>;
  getSessionByTokenHash?(tokenHash: string): Promise<SessionRecord | null>;
  deleteSessionsForUser?(userId: string): Promise<void>;
  saveResetToken?(token: ResetTokenRecord): Promise<void>;
  getResetToken?(tokenHash: string): Promise<ResetTokenRecord | null>;
  deleteResetToken?(tokenHash: string): Promise<void>;

  listLeagues(): Promise<League[]>;
  listLeaguesForUser(userId: string): Promise<League[]>;
  getLeague(id: string): Promise<League | null>;
  getLeagueByInviteCode(code: string): Promise<League | null>;
  insertLeague(league: League): Promise<void>;
  updateLeague(
    id: string,
    patch: Partial<Pick<League, "name" | "inviteCode" | "active">>,
  ): Promise<void>;

  listMembers(leagueId: string): Promise<LeagueMember[]>;
  getMembership(leagueId: string, userId: string): Promise<LeagueMember | null>;
  insertMember(member: LeagueMember): Promise<void>;
  deleteMember(leagueId: string, userId: string): Promise<void>;

  listGames(season?: number): Promise<NflGame[]>;
  getGame(id: string): Promise<NflGame | null>;
  upsertGames(games: NflGame[]): Promise<void>;
  updateGame(id: string, patch: Partial<NflGame>): Promise<void>;

  listLeagueWeeks(leagueId: string): Promise<LeagueWeek[]>;
  getLeagueWeek(
    leagueId: string,
    season: number,
    week: number,
  ): Promise<LeagueWeek | null>;
  upsertLeagueWeek(week: LeagueWeek): Promise<void>;

  listPicks(leagueId: string, season: number, week: number): Promise<GamePick[]>;
  getPick(leagueId: string, userId: string, gameId: string): Promise<GamePick | null>;
  upsertPick(pick: GamePick): Promise<void>;
  /** Server-only read used by commissioner corrections. Still never sent to other members. */
  readPickUnrestricted(leagueId: string, userId: string, gameId: string): Promise<GamePick | null>;
  writePickUnrestricted(pick: GamePick): Promise<void>;

  listTiebreakers(
    leagueId: string,
    season: number,
    week: number,
  ): Promise<TiebreakerEntry[]>;
  upsertTiebreaker(entry: TiebreakerEntry): Promise<void>;

  listMessages(leagueId: string, limit: number): Promise<LeagueMessage[]>;
  insertMessage(message: LeagueMessage): Promise<void>;

  listNotifications(leagueId: string, limit: number): Promise<LeagueNotification[]>;
  insertNotification(notification: LeagueNotification): Promise<boolean>;

  listAudit(leagueId: string): Promise<AuditEntry[]>;
  insertAudit(entry: AuditEntry): Promise<void>;

  listWeeklyResults(leagueId: string, season: number): Promise<WeeklyResult[]>;
  replaceWeeklyResults(
    leagueId: string,
    season: number,
    week: number,
    rows: WeeklyResult[],
  ): Promise<void>;

  replaceAll?(data: Database): Promise<void>;
  snapshot?(): Promise<Database>;
}
