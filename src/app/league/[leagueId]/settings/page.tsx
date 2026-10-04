import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { SettingsPanel, type PickDraft, type SettingsConfirmation } from "@/components/settings-panel";
import { getCurrentProfile } from "@/lib/auth/current";
import { getService } from "@/lib/db";
import { AppError } from "@/lib/domain/errors";
import type { GameStatus, MemberProfile, NflGame } from "@/lib/domain/types";
import { loadLeaguePage } from "@/server/league-page";

const statuses = new Set<GameStatus>(["scheduled", "live", "final", "postponed", "cancelled"]);

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { leagueId } = await params;
  const query = await searchParams;
  const one = (key: string) => {
    const value = query[key];
    return typeof value === "string" ? value : "";
  };
  const profile = await getCurrentProfile();
  if (!profile) notFound();
  const service = await getService();
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:43123";
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? `${proto}://${host}`;
  const view = await loadLeaguePage(async () => {
    const home = await service.getHome(profile.id, leagueId);
    const weeks = await service.listWeeks(profile.id, leagueId);
    const requested = Number(one("week"));
    const week = weeks.includes(requested) ? requested : home.week;
    const board = await service.getPickBoard(profile.id, leagueId, home.season, week);
    const audit = await service.listAudit(profile.id, leagueId);
    return { home, week, board, audit };
  });
  let pickDraft: PickDraft | null = null;
  let confirmation: SettingsConfirmation | null = null;
  let error = one("error");
  if (view.home.role === "commissioner") {
    try {
      const built = await buildCommissionerPrompt({
        service,
        actorId: profile.id,
        leagueId,
        members: view.board.members,
        games: view.board.games,
        one,
      });
      pickDraft = built.pickDraft;
      confirmation = built.confirmation;
    } catch (caught) {
      if (caught instanceof AppError) error = caught.message;
      else throw caught;
    }
  }
  return (
    <SettingsPanel
      league={view.board.league}
      role={view.home.role}
      members={view.board.members}
      games={view.board.games}
      week={view.week}
      season={view.home.season}
      audit={view.audit}
      origin={origin}
      error={error}
      notice={one("notice")}
      pickDraft={pickDraft}
      confirmation={confirmation}
    />
  );
}

async function buildCommissionerPrompt({
  service,
  actorId,
  leagueId,
  members,
  games,
  one,
}: {
  service: Awaited<ReturnType<typeof getService>>;
  actorId: string;
  leagueId: string;
  members: MemberProfile[];
  games: NflGame[];
  one: (key: string) => string;
}): Promise<{ pickDraft: PickDraft | null; confirmation: SettingsConfirmation | null }> {
  const member = members.find((item) => item.userId === one("userId"));
  const game = games.find((item) => item.id === one("gameId"));
  const matchup = game ? `${game.awayTeamAbbreviation} @ ${game.homeTeamAbbreviation}` : "";

  if (one("draft") === "pick" && member && game) {
    const previous = await service.commissionerViewPick(actorId, leagueId, member.userId, game.id);
    return {
      pickDraft: {
        userId: member.userId,
        gameId: game.id,
        reason: one("reason"),
        memberName: member.profile.displayName,
        matchup,
        week: game.week,
        away: game.awayTeamAbbreviation,
        home: game.homeTeamAbbreviation,
        previous,
      },
      confirmation: null,
    };
  }

  if (one("confirm") === "pick" && member && game && one("team")) {
    const teams = [game.awayTeamAbbreviation, game.homeTeamAbbreviation];
    if (!teams.includes(one("team"))) {
      throw new AppError("Pick one of the two teams in this game.", "VALIDATION");
    }
    const previous = await service.commissionerViewPick(actorId, leagueId, member.userId, game.id);
    if (previous === one("team")) {
      throw new AppError("That is already the pick.", "VALIDATION");
    }
    return {
      pickDraft: null,
      confirmation: {
        kind: "pick",
        userId: member.userId,
        gameId: game.id,
        team: one("team"),
        reason: one("reason"),
        memberName: member.profile.displayName,
        matchup,
        week: game.week,
        previous,
      },
    };
  }

  if (one("confirm") === "result" && game && statuses.has(one("status") as GameStatus)) {
    return {
      pickDraft: null,
      confirmation: {
        kind: "result",
        gameId: game.id,
        status: one("status") as GameStatus,
        away: one("away"),
        home: one("home"),
        reason: one("reason"),
        matchup,
        week: game.week,
        awayAbbr: game.awayTeamAbbreviation,
        homeAbbr: game.homeTeamAbbreviation,
      },
    };
  }

  if (one("confirm") === "remove" && member && member.role !== "commissioner") {
    return {
      pickDraft: null,
      confirmation: { kind: "remove", userId: member.userId, name: member.profile.displayName },
    };
  }

  return { pickDraft: null, confirmation: null };
}
