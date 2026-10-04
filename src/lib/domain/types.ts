export type GameStatus =
  | "scheduled"
  | "live"
  | "final"
  | "postponed"
  | "cancelled";

export type LeagueRole = "commissioner" | "member";

export type Profile = {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
};

export type League = {
  id: string;
  name: string;
  inviteCode: string;
  commissionerUserId: string;
  seasonYear: number;
  timezone: string;
  active: boolean;
  createdAt: string;
};

export type LeagueMember = {
  leagueId: string;
  userId: string;
  role: LeagueRole;
  joinedAt: string;
};

export type NflGame = {
  id: string;
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
  createdAt: string;
  updatedAt: string;
};

export type LeagueWeek = {
  id: string;
  leagueId: string;
  season: number;
  week: number;
  tiebreakerGameId: string | null;
};

export type Pick = {
  id: string;
  leagueId: string;
  season: number;
  week: number;
  userId: string;
  gameId: string;
  selectedTeam: string;
  createdAt: string;
  updatedAt: string;
};

export type TiebreakerEntry = {
  id: string;
  leagueId: string;
  season: number;
  week: number;
  userId: string;
  prediction: number;
  createdAt: string;
  updatedAt: string;
};

export type WeeklyResult = {
  id: string;
  leagueId: string;
  season: number;
  week: number;
  userId: string;
  correctPicks: number;
  eligiblePicks: number;
  incorrectPicks: number;
  missedPicks: number;
  tiebreakerPrediction: number | null;
  tiebreakerActual: number | null;
  tiebreakerError: number | null;
  isWinner: boolean;
};

export type LeagueMessage = {
  id: string;
  leagueId: string;
  userId: string;
  message: string;
  createdAt: string;
};

export type LeagueNotification = {
  id: string;
  leagueId: string;
  actorUserId: string | null;
  body: string;
  dedupeKey: string | null;
  createdAt: string;
};

export type AuditEntry = {
  id: string;
  leagueId: string;
  actorUserId: string;
  affectedUserId: string | null;
  actionType: string;
  entityType: string;
  entityId: string | null;
  previousValue: unknown;
  newValue: unknown;
  reason: string | null;
  createdAt: string;
};

export type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: string;
};

export type ResetTokenRecord = {
  tokenHash: string;
  userId: string;
  expiresAt: string;
};

export type CellVisibility = "own" | "revealed" | "hidden";

export type CellResult =
  | "correct"
  | "incorrect"
  | "no-pick"
  | "pending"
  | "locked"
  | "hidden"
  | "cancelled";

export type BoardCell = {
  userId: string;
  gameId: string;
  visibility: CellVisibility;
  selectedTeam: string | null;
  result: CellResult;
};

export type BoardTiebreaker = {
  userId: string;
  visibility: CellVisibility;
  prediction: number | null;
  error: number | null;
};

export type StandingRow = {
  userId: string;
  displayName: string;
  correctPicks: number;
  eligiblePicks: number;
  incorrectPicks: number;
  missedPicks: number;
  tiebreakerPrediction: number | null;
  tiebreakerActual: number | null;
  tiebreakerError: number | null;
  isWinner: boolean;
  weeklyWins: number;
  sharedWins: number;
  pickPercentage: number;
};

export type MemberProfile = LeagueMember & { profile: Profile };

export type PickBoard = {
  league: League;
  season: number;
  week: number;
  role: LeagueRole;
  viewerId: string;
  games: NflGame[];
  members: MemberProfile[];
  cells: BoardCell[];
  tiebreakers: BoardTiebreaker[];
  tiebreakerGame: NflGame | null;
  tiebreakerActual: number | null;
  weekComplete: boolean;
  tiebreakerNeeded: boolean;
  standings: StandingRow[];
};

export type LeagueHome = {
  league: League;
  role: LeagueRole;
  season: number;
  week: number;
  games: NflGame[];
  myPicksMade: number;
  totalGames: number;
  nextGame: NflGame | null;
  liveStandings: StandingRow[];
  lastWeek: {
    week: number;
    standings: StandingRow[];
    tiebreakerNeeded: boolean;
    tiebreakerActual: number | null;
    tiebreakerGame: NflGame | null;
    weekComplete: boolean;
  } | null;
  notifications: LeagueNotification[];
  memberCount: number;
};

export type LeaderboardRow = StandingRow;

export type InvitePreview = {
  leagueId: string;
  name: string;
  seasonYear: number;
  memberCount: number;
  alreadyMember: boolean;
};

export type ChatMessage = LeagueMessage & { displayName: string };

export type AuditView = AuditEntry & {
  actorName: string;
  affectedName: string | null;
};
