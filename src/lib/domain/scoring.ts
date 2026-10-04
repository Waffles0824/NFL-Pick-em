import type { GameStatus, NflGame, WeeklyResult } from "@/lib/domain/types";
import { hasKickedOff } from "@/lib/domain/time";

/**
 * Scoring rules
 * - Correct winner: 1. Anything else on a final game: 0.
 * - No pick at kickoff stays empty and scores 0. Nothing is auto-picked.
 * - A final tie has no winner. Team picks cannot be correct.
 * - Cancelled games are left out of the denominator.
 * - Future and in-progress games are not eligible yet.
 * - Weekly rank: most correct, then smaller Monday total error.
 * - A missing Monday guess sorts worse than any numeric error.
 * - The same correct total and the same error (including both missing) is a co-win.
 * - No further tiebreaker exists.
 */

export type PickGrade =
  | "correct"
  | "incorrect"
  | "missed"
  | "pending"
  | "cancelled";

export type ScoreRow = {
  userId: string;
  correctPicks: number;
  incorrectPicks: number;
  missedPicks: number;
  eligiblePicks: number;
  tiebreakerPrediction: number | null;
  tiebreakerActual: number | null;
  tiebreakerError: number | null;
  isWinner: boolean;
};

export function isPickLocked(game: NflGame, now: Date): boolean {
  if (game.status === "cancelled" || game.status === "final" || game.status === "live") {
    return true;
  }
  return hasKickedOff(game.kickoffAt, now);
}

export function gradePick(game: NflGame, selectedTeam: string | null): PickGrade {
  if (game.status === "cancelled") return "cancelled";
  if (game.status !== "final") return "pending";
  if (!selectedTeam) return "missed";
  if (!game.winnerTeam) return "incorrect";
  return selectedTeam === game.winnerTeam ? "correct" : "incorrect";
}

export function pointsForGrade(grade: PickGrade): number {
  return grade === "correct" ? 1 : 0;
}

export function isEligibleGrade(grade: PickGrade): boolean {
  return grade === "correct" || grade === "incorrect" || grade === "missed";
}

export function tiebreakerError(
  prediction: number | null,
  actual: number | null,
): number | null {
  if (prediction == null || actual == null) return null;
  return Math.abs(prediction - actual);
}

export function combinedPoints(game: NflGame): number | null {
  if (game.status !== "final") return null;
  if (game.awayScore == null || game.homeScore == null) return null;
  return game.awayScore + game.homeScore;
}

export function isWeekComplete(games: NflGame[]): boolean {
  const counting = games.filter((game) => game.status !== "cancelled");
  return counting.length > 0 && counting.every((game) => game.status === "final");
}

export function defaultTiebreakerGame(games: NflGame[]): NflGame | null {
  const open = games.filter((game) => game.status !== "cancelled");
  const mondays = open.filter((game) => game.isMondayGame);
  const pool = mondays.length > 0 ? mondays : open;
  return (
    [...pool].sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)).at(-1) ?? null
  );
}

export function tiebreakerWasNeeded(rows: { correctPicks: number }[]): boolean {
  if (rows.length < 2) return false;
  const best = Math.max(...rows.map((row) => row.correctPicks));
  return rows.filter((row) => row.correctPicks === best).length > 1;
}

function errorSortKey(error: number | null): number {
  return error == null ? Number.POSITIVE_INFINITY : error;
}

export function compareScoreRows(a: ScoreRow, b: ScoreRow): number {
  if (a.correctPicks !== b.correctPicks) return b.correctPicks - a.correctPicks;
  const errorDiff = errorSortKey(a.tiebreakerError) - errorSortKey(b.tiebreakerError);
  if (errorDiff !== 0) return errorDiff;
  return a.userId.localeCompare(b.userId);
}

export function markWinners(rows: ScoreRow[], weekComplete: boolean): ScoreRow[] {
  const ranked = [...rows].sort(compareScoreRows);
  if (!weekComplete || ranked.length === 0) {
    return ranked.map((row) => ({ ...row, isWinner: false }));
  }
  const best = ranked[0];
  return ranked.map((row) => ({
    ...row,
    isWinner:
      row.correctPicks === best.correctPicks &&
      row.tiebreakerError === best.tiebreakerError,
  }));
}

export function scoreWeek(input: {
  games: NflGame[];
  userIds: string[];
  picks: { userId: string; gameId: string; selectedTeam: string }[];
  predictions: { userId: string; prediction: number }[];
  tiebreakerGame: NflGame | null;
}): ScoreRow[] {
  const actual = input.tiebreakerGame ? combinedPoints(input.tiebreakerGame) : null;
  const complete = isWeekComplete(input.games);
  const rows = input.userIds.map((userId) => {
    let correctPicks = 0;
    let incorrectPicks = 0;
    let missedPicks = 0;
    let eligiblePicks = 0;
    for (const game of input.games) {
      const pick = input.picks.find(
        (item) => item.userId === userId && item.gameId === game.id,
      );
      const grade = gradePick(game, pick?.selectedTeam ?? null);
      if (!isEligibleGrade(grade)) continue;
      eligiblePicks += 1;
      if (grade === "correct") correctPicks += 1;
      else if (grade === "incorrect") incorrectPicks += 1;
      else missedPicks += 1;
    }
    const prediction =
      input.predictions.find((item) => item.userId === userId)?.prediction ?? null;
    return {
      userId,
      correctPicks,
      incorrectPicks,
      missedPicks,
      eligiblePicks,
      tiebreakerPrediction: prediction,
      tiebreakerActual: actual,
      tiebreakerError: tiebreakerError(prediction, actual),
      isWinner: false,
    };
  });
  return markWinners(rows, complete);
}

export function winnerFromScores(
  game: Pick<NflGame, "awayTeamAbbreviation" | "homeTeamAbbreviation">,
  status: GameStatus,
  awayScore: number | null,
  homeScore: number | null,
): string | null {
  if (status !== "final" || awayScore == null || homeScore == null) return null;
  if (awayScore === homeScore) return null;
  return awayScore > homeScore
    ? game.awayTeamAbbreviation
    : game.homeTeamAbbreviation;
}

export function toWeeklyResults(
  leagueId: string,
  season: number,
  week: number,
  rows: ScoreRow[],
  idFor: (userId: string) => string,
): WeeklyResult[] {
  return rows.map((row) => ({
    id: idFor(row.userId),
    leagueId,
    season,
    week,
    userId: row.userId,
    correctPicks: row.correctPicks,
    eligiblePicks: row.eligiblePicks,
    incorrectPicks: row.incorrectPicks,
    missedPicks: row.missedPicks,
    tiebreakerPrediction: row.tiebreakerPrediction,
    tiebreakerActual: row.tiebreakerActual,
    tiebreakerError: row.tiebreakerError,
    isWinner: row.isWinner,
  }));
}

export function pickPercentage(correct: number, eligible: number): number {
  if (eligible <= 0) return 0;
  return Math.round((correct / eligible) * 1000) / 10;
}
