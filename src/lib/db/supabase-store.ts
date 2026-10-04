import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DataStore } from "@/lib/db/types";
import { AppError } from "@/lib/domain/errors";
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
  TiebreakerEntry,
  WeeklyResult,
} from "@/lib/domain/types";

type Client = SupabaseClient;

export function createSupabaseStore(user: Client, admin: Client | null): DataStore {
  function privileged(): Client {
    if (!admin) {
      throw new AppError(
        "Add SUPABASE_SERVICE_ROLE_KEY on the server before syncing games or saving league history.",
        "UNAVAILABLE",
      );
    }
    return admin;
  }

  function fail(error: { message: string } | null, fallback: string): void {
    if (!error) return;
    if (/row-level security/i.test(error.message)) {
      throw new AppError("This game locked at kickoff.", "LOCKED");
    }
    throw new AppError(error.message || fallback, "UNAVAILABLE");
  }

  return {
    mode: "supabase",

    async getProfile(id) {
      const { data, error } = await user.from("profiles").select("*").eq("id", id).maybeSingle();
      fail(error, "Could not load profile.");
      return data ? mapProfile(data) : null;
    },

    async getProfileByEmail(email) {
      const db = privileged();
      const { data, error } = await db
        .from("profiles")
        .select("*")
        .eq("email", normalizeEmail(email))
        .maybeSingle();
      fail(error, "Could not load profile.");
      return data ? mapProfile(data) : null;
    },

    async insertProfile(profile) {
      const { error } = await privileged().from("profiles").insert(profileToRow(profile));
      fail(error, "Could not create profile.");
    },

    async updateProfile(id, patch) {
      const { error } = await user
        .from("profiles")
        .update({
          display_name: patch.displayName,
          ...(patch.avatarUrl !== undefined ? { avatar_url: patch.avatarUrl } : {}),
        })
        .eq("id", id);
      fail(error, "Could not update profile.");
    },

    async listProfilesByIds(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await user.from("profiles").select("*").in("id", ids);
      fail(error, "Could not load profiles.");
      return (data ?? []).map(mapProfile);
    },

    async listLeagues() {
      const { data, error } = await privileged().from("leagues").select("*").eq("active", true);
      fail(error, "Could not load leagues.");
      return (data ?? []).map(mapLeague);
    },

    async listLeaguesForUser(userId) {
      const { data, error } = await user
        .from("league_members")
        .select("leagues(*)")
        .eq("user_id", userId);
      fail(error, "Could not load leagues.");
      return (data ?? [])
        .map((row) => {
          const league = firstRelation(row.leagues);
          return league ? mapLeague(league) : null;
        })
        .filter((league): league is League => league !== null && league.active);
    },

    async getLeague(id) {
      const { data, error } = await privileged().from("leagues").select("*").eq("id", id).maybeSingle();
      fail(error, "Could not load league.");
      return data ? mapLeague(data) : null;
    },

    async getLeagueByInviteCode(code) {
      const { data, error } = await privileged()
        .from("leagues")
        .select("*")
        .eq("invite_code", normalizeInviteCode(code))
        .eq("active", true)
        .maybeSingle();
      fail(error, "Could not load league.");
      return data ? mapLeague(data) : null;
    },

    async insertLeague(league) {
      const { error } = await privileged().from("leagues").insert(leagueToRow(league));
      fail(error, "Could not create league.");
    },

    async updateLeague(id, patch) {
      const { error } = await user
        .from("leagues")
        .update({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.inviteCode !== undefined ? { invite_code: patch.inviteCode } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
        })
        .eq("id", id);
      fail(error, "Could not update league.");
    },

    async listMembers(leagueId) {
      const { data, error } = await privileged()
        .from("league_members")
        .select("*")
        .eq("league_id", leagueId);
      fail(error, "Could not load members.");
      return (data ?? []).map(mapMember);
    },

    async getMembership(leagueId, userId) {
      const { data, error } = await privileged()
        .from("league_members")
        .select("*")
        .eq("league_id", leagueId)
        .eq("user_id", userId)
        .maybeSingle();
      fail(error, "Could not load membership.");
      return data ? mapMember(data) : null;
    },

    async insertMember(member) {
      const { error } = await privileged().from("league_members").insert({
        league_id: member.leagueId,
        user_id: member.userId,
        role: member.role,
        joined_at: member.joinedAt,
      });
      fail(error, "Could not add member.");
    },

    async deleteMember(leagueId, userId) {
      const { error } = await user
        .from("league_members")
        .delete()
        .eq("league_id", leagueId)
        .eq("user_id", userId);
      fail(error, "Could not remove member.");
    },

    async listGames(season) {
      let query = privileged().from("nfl_games").select("*").order("kickoff_at");
      if (season !== undefined) query = query.eq("season", season);
      const { data, error } = await query;
      fail(error, "Could not load games.");
      return (data ?? []).map(mapGame);
    },

    async getGame(id) {
      const { data, error } = await user.from("nfl_games").select("*").eq("id", id).maybeSingle();
      fail(error, "Could not load game.");
      return data ? mapGame(data) : null;
    },

    async upsertGames(games) {
      if (games.length === 0) return;
      const { error } = await privileged()
        .from("nfl_games")
        .upsert(games.map(gameToRow), { onConflict: "id" });
      fail(error, "Could not save games.");
    },

    async updateGame(id, patch) {
      const { error } = await privileged().from("nfl_games").update(gamePatch(patch)).eq("id", id);
      fail(error, "Could not update game.");
    },

    async listLeagueWeeks(leagueId) {
      const { data, error } = await user.from("league_weeks").select("*").eq("league_id", leagueId);
      fail(error, "Could not load weeks.");
      return (data ?? []).map(mapLeagueWeek);
    },

    async getLeagueWeek(leagueId, season, week) {
      const { data, error } = await user
        .from("league_weeks")
        .select("*")
        .eq("league_id", leagueId)
        .eq("season", season)
        .eq("week", week)
        .maybeSingle();
      fail(error, "Could not load week.");
      return data ? mapLeagueWeek(data) : null;
    },

    async upsertLeagueWeek(week) {
      const { error } = await privileged()
        .from("league_weeks")
        .upsert(leagueWeekToRow(week), { onConflict: "league_id,season,week" });
      fail(error, "Could not save week.");
    },

    async listPicks(leagueId, season, week) {
      const { data, error } = await user
        .from("picks")
        .select("*")
        .eq("league_id", leagueId)
        .eq("season", season)
        .eq("week", week);
      fail(error, "Could not load picks.");
      return (data ?? []).map(mapPick);
    },

    async getPick(leagueId, userId, gameId) {
      const { data, error } = await user
        .from("picks")
        .select("*")
        .eq("league_id", leagueId)
        .eq("user_id", userId)
        .eq("game_id", gameId)
        .maybeSingle();
      fail(error, "Could not load pick.");
      return data ? mapPick(data) : null;
    },

    async upsertPick(pick) {
      const { error } = await user.from("picks").upsert(pickToRow(pick), {
        onConflict: "league_id,user_id,game_id",
      });
      fail(error, "Could not save pick.");
    },

    async readPickUnrestricted(leagueId, userId, gameId) {
      const { data, error } = await privileged()
        .from("picks")
        .select("*")
        .eq("league_id", leagueId)
        .eq("user_id", userId)
        .eq("game_id", gameId)
        .maybeSingle();
      fail(error, "Could not load pick.");
      return data ? mapPick(data) : null;
    },

    async writePickUnrestricted(pick) {
      const { error } = await privileged().from("picks").upsert(pickToRow(pick), {
        onConflict: "league_id,user_id,game_id",
      });
      fail(error, "Could not save pick.");
    },

    async listTiebreakers(leagueId, season, week) {
      const { data, error } = await user
        .from("tiebreaker_entries")
        .select("*")
        .eq("league_id", leagueId)
        .eq("season", season)
        .eq("week", week);
      fail(error, "Could not load tiebreakers.");
      return (data ?? []).map(mapTiebreaker);
    },

    async upsertTiebreaker(entry) {
      const { error } = await user.from("tiebreaker_entries").upsert(tiebreakerToRow(entry), {
        onConflict: "league_id,season,week,user_id",
      });
      fail(error, "Could not save tiebreaker.");
    },

    async listMessages(leagueId, limit) {
      const { data, error } = await user
        .from("league_messages")
        .select("*")
        .eq("league_id", leagueId)
        .order("created_at", { ascending: false })
        .limit(limit);
      fail(error, "Could not load chat.");
      return (data ?? []).map(mapMessage).reverse();
    },

    async insertMessage(message) {
      const { error } = await user.from("league_messages").insert({
        id: message.id,
        league_id: message.leagueId,
        user_id: message.userId,
        message: message.message,
        created_at: message.createdAt,
      });
      fail(error, "Could not send message.");
    },

    async listNotifications(leagueId, limit) {
      const { data, error } = await user
        .from("league_notifications")
        .select("*")
        .eq("league_id", leagueId)
        .order("created_at", { ascending: false })
        .limit(limit);
      fail(error, "Could not load notifications.");
      return (data ?? []).map(mapNotification);
    },

    async insertNotification(notification) {
      const { error } = await privileged().from("league_notifications").insert({
        id: notification.id,
        league_id: notification.leagueId,
        actor_user_id: notification.actorUserId,
        body: notification.body,
        dedupe_key: notification.dedupeKey,
        created_at: notification.createdAt,
      });
      if (error?.code === "23505") return false;
      fail(error, "Could not save notification.");
      return true;
    },

    async listAudit(leagueId) {
      const { data, error } = await user
        .from("league_audit_log")
        .select("*")
        .eq("league_id", leagueId)
        .order("created_at", { ascending: false });
      fail(error, "Could not load audit history.");
      return (data ?? []).map(mapAudit);
    },

    async insertAudit(entry) {
      const { error } = await privileged().from("league_audit_log").insert({
        id: entry.id,
        league_id: entry.leagueId,
        actor_user_id: entry.actorUserId,
        affected_user_id: entry.affectedUserId,
        action_type: entry.actionType,
        entity_type: entry.entityType,
        entity_id: entry.entityId,
        previous_value: entry.previousValue,
        new_value: entry.newValue,
        reason: entry.reason,
        created_at: entry.createdAt,
      });
      fail(error, "Could not save audit history.");
    },

    async listWeeklyResults(leagueId, season) {
      const { data, error } = await privileged()
        .from("weekly_results")
        .select("*")
        .eq("league_id", leagueId)
        .eq("season", season);
      fail(error, "Could not load results.");
      return (data ?? []).map(mapWeeklyResult);
    },

    async replaceWeeklyResults(leagueId, season, week, rows) {
      const db = privileged();
      const deleted = await db
        .from("weekly_results")
        .delete()
        .eq("league_id", leagueId)
        .eq("season", season)
        .eq("week", week);
      fail(deleted.error, "Could not refresh results.");
      if (rows.length === 0) return;
      const inserted = await db.from("weekly_results").insert(rows.map(weeklyResultToRow));
      fail(inserted.error, "Could not save results.");
    },
  };
}

function firstRelation(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return (value[0] as Record<string, unknown> | undefined) ?? null;
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return null;
}

function mapProfile(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    displayName: String(row.display_name),
    email: String(row.email),
    avatarUrl: (row.avatar_url as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function profileToRow(profile: Profile) {
  return {
    id: profile.id,
    display_name: profile.displayName,
    email: profile.email,
    avatar_url: profile.avatarUrl,
    created_at: profile.createdAt,
  };
}

function mapLeague(row: Record<string, unknown>): League {
  return {
    id: String(row.id),
    name: String(row.name),
    inviteCode: String(row.invite_code),
    commissionerUserId: String(row.commissioner_user_id),
    seasonYear: Number(row.season_year),
    timezone: String(row.timezone),
    active: Boolean(row.active),
    createdAt: String(row.created_at),
  };
}

function leagueToRow(league: League) {
  return {
    id: league.id,
    name: league.name,
    invite_code: league.inviteCode,
    commissioner_user_id: league.commissionerUserId,
    season_year: league.seasonYear,
    timezone: league.timezone,
    active: league.active,
    created_at: league.createdAt,
  };
}

function mapMember(row: Record<string, unknown>): LeagueMember {
  return {
    leagueId: String(row.league_id),
    userId: String(row.user_id),
    role: row.role === "commissioner" ? "commissioner" : "member",
    joinedAt: String(row.joined_at),
  };
}

function mapGame(row: Record<string, unknown>): NflGame {
  return {
    id: String(row.id),
    providerGameId: String(row.provider_game_id),
    season: Number(row.season),
    week: Number(row.week),
    awayTeam: String(row.away_team),
    awayTeamAbbreviation: String(row.away_team_abbreviation),
    homeTeam: String(row.home_team),
    homeTeamAbbreviation: String(row.home_team_abbreviation),
    kickoffAt: String(row.kickoff_at),
    status: row.status as NflGame["status"],
    awayScore: row.away_score == null ? null : Number(row.away_score),
    homeScore: row.home_score == null ? null : Number(row.home_score),
    winnerTeam: (row.winner_team as string | null) ?? null,
    isMondayGame: Boolean(row.is_monday_game),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function gameToRow(game: NflGame) {
  return {
    id: game.id,
    provider_game_id: game.providerGameId,
    season: game.season,
    week: game.week,
    away_team: game.awayTeam,
    away_team_abbreviation: game.awayTeamAbbreviation,
    home_team: game.homeTeam,
    home_team_abbreviation: game.homeTeamAbbreviation,
    kickoff_at: game.kickoffAt,
    status: game.status,
    away_score: game.awayScore,
    home_score: game.homeScore,
    winner_team: game.winnerTeam,
    is_monday_game: game.isMondayGame,
    created_at: game.createdAt,
    updated_at: game.updatedAt,
  };
}

function gamePatch(patch: Partial<NflGame>) {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.awayScore !== undefined) row.away_score = patch.awayScore;
  if (patch.homeScore !== undefined) row.home_score = patch.homeScore;
  if (patch.winnerTeam !== undefined) row.winner_team = patch.winnerTeam;
  if (patch.kickoffAt !== undefined) row.kickoff_at = patch.kickoffAt;
  if (patch.updatedAt !== undefined) row.updated_at = patch.updatedAt;
  if (patch.isMondayGame !== undefined) row.is_monday_game = patch.isMondayGame;
  return row;
}

function mapLeagueWeek(row: Record<string, unknown>): LeagueWeek {
  return {
    id: String(row.id),
    leagueId: String(row.league_id),
    season: Number(row.season),
    week: Number(row.week),
    tiebreakerGameId: (row.tiebreaker_game_id as string | null) ?? null,
  };
}

function leagueWeekToRow(week: LeagueWeek) {
  return {
    id: week.id,
    league_id: week.leagueId,
    season: week.season,
    week: week.week,
    tiebreaker_game_id: week.tiebreakerGameId,
  };
}

function mapPick(row: Record<string, unknown>): GamePick {
  return {
    id: String(row.id),
    leagueId: String(row.league_id),
    season: Number(row.season),
    week: Number(row.week),
    userId: String(row.user_id),
    gameId: String(row.game_id),
    selectedTeam: String(row.selected_team),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function pickToRow(pick: GamePick) {
  return {
    id: pick.id,
    league_id: pick.leagueId,
    season: pick.season,
    week: pick.week,
    user_id: pick.userId,
    game_id: pick.gameId,
    selected_team: pick.selectedTeam,
    created_at: pick.createdAt,
    updated_at: pick.updatedAt,
  };
}

function mapTiebreaker(row: Record<string, unknown>): TiebreakerEntry {
  return {
    id: String(row.id),
    leagueId: String(row.league_id),
    season: Number(row.season),
    week: Number(row.week),
    userId: String(row.user_id),
    prediction: Number(row.prediction),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function tiebreakerToRow(entry: TiebreakerEntry) {
  return {
    id: entry.id,
    league_id: entry.leagueId,
    season: entry.season,
    week: entry.week,
    user_id: entry.userId,
    prediction: entry.prediction,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
  };
}

function mapMessage(row: Record<string, unknown>): LeagueMessage {
  return {
    id: String(row.id),
    leagueId: String(row.league_id),
    userId: String(row.user_id),
    message: String(row.message),
    createdAt: String(row.created_at),
  };
}

function mapNotification(row: Record<string, unknown>): LeagueNotification {
  return {
    id: String(row.id),
    leagueId: String(row.league_id),
    actorUserId: (row.actor_user_id as string | null) ?? null,
    body: String(row.body),
    dedupeKey: (row.dedupe_key as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function mapAudit(row: Record<string, unknown>): AuditEntry {
  return {
    id: String(row.id),
    leagueId: String(row.league_id),
    actorUserId: String(row.actor_user_id),
    affectedUserId: (row.affected_user_id as string | null) ?? null,
    actionType: String(row.action_type),
    entityType: String(row.entity_type),
    entityId: (row.entity_id as string | null) ?? null,
    previousValue: row.previous_value ?? null,
    newValue: row.new_value ?? null,
    reason: (row.reason as string | null) ?? null,
    createdAt: String(row.created_at),
  };
}

function mapWeeklyResult(row: Record<string, unknown>): WeeklyResult {
  return {
    id: String(row.id),
    leagueId: String(row.league_id),
    season: Number(row.season),
    week: Number(row.week),
    userId: String(row.user_id),
    correctPicks: Number(row.correct_picks),
    eligiblePicks: Number(row.eligible_picks),
    incorrectPicks: Number(row.incorrect_picks),
    missedPicks: Number(row.missed_picks),
    tiebreakerPrediction:
      row.tiebreaker_prediction == null ? null : Number(row.tiebreaker_prediction),
    tiebreakerActual: row.tiebreaker_actual == null ? null : Number(row.tiebreaker_actual),
    tiebreakerError: row.tiebreaker_error == null ? null : Number(row.tiebreaker_error),
    isWinner: Boolean(row.is_winner),
  };
}

function weeklyResultToRow(row: WeeklyResult) {
  return {
    id: row.id,
    league_id: row.leagueId,
    season: row.season,
    week: row.week,
    user_id: row.userId,
    correct_picks: row.correctPicks,
    eligible_picks: row.eligiblePicks,
    incorrect_picks: row.incorrectPicks,
    missed_picks: row.missedPicks,
    tiebreaker_prediction: row.tiebreakerPrediction,
    tiebreaker_actual: row.tiebreakerActual,
    tiebreaker_error: row.tiebreakerError,
    is_winner: row.isWinner,
  };
}
