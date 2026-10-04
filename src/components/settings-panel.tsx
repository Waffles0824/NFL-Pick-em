import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AuditView, GameStatus, League, MemberProfile, NflGame } from "@/lib/domain/types";
import {
  beginPickCorrectionFormAction,
  beginRemoveMemberFormAction,
  confirmPickFormAction,
  confirmRemoveMemberFormAction,
  confirmResultFormAction,
  leaveLeagueFormAction,
  regenerateInviteFormAction,
  renameLeagueFormAction,
  reviewPickFormAction,
  reviewResultFormAction,
  setTiebreakerFormAction,
  syncScheduleFormAction,
} from "@/server/actions";

export type PickDraft = {
  userId: string;
  gameId: string;
  reason: string;
  memberName: string;
  matchup: string;
  week: number;
  away: string;
  home: string;
  previous: string | null;
};

export type SettingsConfirmation =
  | {
      kind: "pick";
      userId: string;
      gameId: string;
      team: string;
      reason: string;
      memberName: string;
      matchup: string;
      week: number;
      previous: string | null;
    }
  | {
      kind: "result";
      gameId: string;
      status: GameStatus;
      away: string;
      home: string;
      reason: string;
      matchup: string;
      week: number;
      awayAbbr: string;
      homeAbbr: string;
    }
  | { kind: "remove"; userId: string; name: string };

export function SettingsPanel({
  league,
  role,
  members,
  games,
  week,
  season,
  audit,
  origin,
  error,
  notice,
  pickDraft,
  confirmation,
}: {
  league: League;
  role: "commissioner" | "member";
  members: MemberProfile[];
  games: NflGame[];
  week: number;
  season: number;
  audit: AuditView[];
  origin: string;
  error?: string;
  notice?: string;
  pickDraft?: PickDraft | null;
  confirmation?: SettingsConfirmation | null;
}) {
  const commissioner = role === "commissioner";
  const inviteLink = `${origin}/join/${league.inviteCode}`;
  const settingsHref = `/league/${league.id}/settings`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Invite friends, and keep a visible record when a commissioner changes the sheet.
        </p>
      </div>
      {error ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? <p className="rounded-xl bg-secondary px-3 py-2 text-sm">{notice}</p> : null}
      {confirmation ? (
        <Confirmation
          leagueId={league.id}
          settingsHref={settingsHref}
          confirmation={confirmation}
        />
      ) : null}

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="font-medium">Invite</h2>
        <p className="mt-1 font-mono text-lg tracking-[0.2em]">{league.inviteCode}</p>
        <p className="mt-1 break-all text-sm text-muted-foreground">{inviteLink}</p>
        {commissioner ? (
          <form action={regenerateInviteFormAction} className="mt-3">
            <input type="hidden" name="leagueId" value={league.id} />
            <Button type="submit" variant="outline" className="h-11">
              New invite code
            </Button>
          </form>
        ) : null}
      </section>

      {commissioner ? (
        <form action={renameLeagueFormAction} className="rounded-2xl border bg-card p-4">
          <input type="hidden" name="leagueId" value={league.id} />
          <Label htmlFor="league-name">League name</Label>
          <div className="mt-2 flex gap-2">
            <Input id="league-name" name="name" defaultValue={league.name} className="h-11" />
            <Button type="submit" className="h-11">
              Save
            </Button>
          </div>
        </form>
      ) : null}

      <section className="rounded-2xl border bg-card p-4">
        <h2 className="font-medium">Members</h2>
        <ul className="mt-3 divide-y">
          {members.map((member) => (
            <li key={member.userId} className="flex items-center justify-between gap-3 py-3 text-sm">
              <span>
                {member.profile.displayName}
                <span className="ml-2 text-muted-foreground capitalize">{member.role}</span>
              </span>
              {commissioner && member.role !== "commissioner" ? (
                <form action={beginRemoveMemberFormAction}>
                  <input type="hidden" name="leagueId" value={league.id} />
                  <input type="hidden" name="userId" value={member.userId} />
                  <Button type="submit" variant="outline" size="sm">
                    Remove
                  </Button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
        {!commissioner ? (
          <form action={leaveLeagueFormAction} className="mt-3">
            <input type="hidden" name="leagueId" value={league.id} />
            <Button type="submit" variant="outline">
              Leave league
            </Button>
          </form>
        ) : null}
      </section>

      {commissioner ? (
        <>
          <form action={setTiebreakerFormAction} className="rounded-2xl border bg-card p-4">
            <input type="hidden" name="leagueId" value={league.id} />
            <input type="hidden" name="season" value={season} />
            <input type="hidden" name="week" value={week} />
            <h2 className="font-medium">Monday tiebreaker game</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Change it only before the current designated game kicks off.
            </p>
            <select name="gameId" className="mt-3 h-11 w-full rounded-xl border bg-background px-3" defaultValue={games.find((game) => game.isMondayGame)?.id ?? games.at(-1)?.id}>
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.awayTeamAbbreviation} @ {game.homeTeamAbbreviation}
                  {game.isMondayGame ? " · Monday" : ""}
                </option>
              ))}
            </select>
            <Button type="submit" className="mt-3 h-11">
              Set tiebreaker
            </Button>
          </form>

          <form action={syncScheduleFormAction} className="rounded-2xl border bg-card p-4">
            <input type="hidden" name="leagueId" value={league.id} />
            <h2 className="font-medium">Sync NFL scores</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pull the regular-season schedule. Final scores already stored are left alone.
            </p>
            <Button type="submit" className="mt-3 h-11">
              Sync now
            </Button>
          </form>

          <PickCorrection leagueId={league.id} members={members} games={games} draft={pickDraft} />
          <ResultCorrection leagueId={league.id} games={games} />
        </>
      ) : null}

      <section>
        <h2 className="font-medium">Audit history</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Competition changes stay here. There is no button to delete them.
        </p>
        {audit.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No commissioner changes yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {audit.map((entry) => (
              <li key={entry.id} className="rounded-2xl border bg-card p-3 text-sm">
                <p>
                  <span className="font-medium">{entry.actorName}</span> · {entry.actionType.replaceAll("_", " ")}
                  {entry.affectedName ? ` · ${entry.affectedName}` : ""}
                </p>
                <p className="mt-1 text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                  {entry.reason ? ` · ${entry.reason}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Confirmation({
  leagueId,
  settingsHref,
  confirmation,
}: {
  leagueId: string;
  settingsHref: string;
  confirmation: SettingsConfirmation;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-lg">
        <h2 id="confirm-title" className="font-heading text-2xl tracking-tight">
          {confirmation.kind === "remove" ? `Remove ${confirmation.name}?` : "Confirm change"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{confirmationCopy(confirmation)}</p>
        <div className="mt-5 flex justify-end gap-2">
          <a href={settingsHref} className="inline-flex h-11 items-center rounded-lg border px-4 text-sm">
            Cancel
          </a>
          {confirmation.kind === "pick" ? (
            <form action={confirmPickFormAction}>
              <input type="hidden" name="leagueId" value={leagueId} />
              <input type="hidden" name="userId" value={confirmation.userId} />
              <input type="hidden" name="gameId" value={confirmation.gameId} />
              <input type="hidden" name="team" value={confirmation.team} />
              <input type="hidden" name="reason" value={confirmation.reason} />
              <Button type="submit" className="h-11">
                Confirm change
              </Button>
            </form>
          ) : null}
          {confirmation.kind === "result" ? (
            <form action={confirmResultFormAction}>
              <input type="hidden" name="leagueId" value={leagueId} />
              <input type="hidden" name="gameId" value={confirmation.gameId} />
              <input type="hidden" name="status" value={confirmation.status} />
              <input type="hidden" name="away" value={confirmation.away} />
              <input type="hidden" name="home" value={confirmation.home} />
              <input type="hidden" name="reason" value={confirmation.reason} />
              <Button type="submit" className="h-11">
                Confirm change
              </Button>
            </form>
          ) : null}
          {confirmation.kind === "remove" ? (
            <form action={confirmRemoveMemberFormAction}>
              <input type="hidden" name="leagueId" value={leagueId} />
              <input type="hidden" name="userId" value={confirmation.userId} />
              <Button type="submit" className="h-11">
                Remove
              </Button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function confirmationCopy(confirmation: SettingsConfirmation): string {
  if (confirmation.kind === "remove") {
    return `${confirmation.name} will lose access. Their past picks stay on the sheet so earlier weeks do not change.`;
  }
  if (confirmation.kind === "result") {
    const score =
      confirmation.away !== "" && confirmation.home !== ""
        ? `, ${confirmation.awayAbbr} ${confirmation.away}, ${confirmation.homeAbbr} ${confirmation.home}`
        : "";
    return `You are changing the Week ${confirmation.week} ${confirmation.matchup} result to ${confirmation.status}${score}. This will be visible to the league.`;
  }
  const previous = confirmation.previous
    ? `from ${confirmation.previous} to ${confirmation.team}`
    : `to ${confirmation.team}`;
  return `You are changing ${confirmation.memberName}'s Week ${confirmation.week} ${confirmation.matchup} pick ${previous}. This change will be visible to everyone in the league.`;
}

function PickCorrection({
  leagueId,
  members,
  games,
  draft,
}: {
  leagueId: string;
  members: MemberProfile[];
  games: NflGame[];
  draft?: PickDraft | null;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4">
      <h2 className="font-medium">Correct a pick</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Use this only to fix a mistake. The league will see the change.
      </p>
      {draft ? (
        <form action={reviewPickFormAction} className="mt-4 rounded-xl bg-secondary p-3">
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="userId" value={draft.userId} />
          <input type="hidden" name="gameId" value={draft.gameId} />
          <input type="hidden" name="reason" value={draft.reason} />
          <p className="text-sm">
            {draft.memberName}&apos;s Week {draft.week} {draft.matchup} pick is{" "}
            {draft.previous ?? "no pick"}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {[draft.away, draft.home].map((team) => (
              <Button key={team} type="submit" name="team" value={team} className="h-11" variant={draft.previous === team ? "outline" : "default"}>
                Set pick to {team}
              </Button>
            ))}
          </div>
        </form>
      ) : null}
      <form action={beginPickCorrectionFormAction} className="mt-3 grid gap-3">
        <input type="hidden" name="leagueId" value={leagueId} />
        <div className="grid gap-3 sm:grid-cols-2">
          <select name="userId" className="h-11 rounded-xl border bg-background px-3" defaultValue={draft?.userId ?? members[0]?.userId}>
            {members.map((item) => (
              <option key={item.userId} value={item.userId}>
                {item.profile.displayName}
              </option>
            ))}
          </select>
          <select name="gameId" className="h-11 rounded-xl border bg-background px-3" defaultValue={draft?.gameId ?? games[0]?.id}>
            {games.map((item) => (
              <option key={item.id} value={item.id}>
                {item.awayTeamAbbreviation} @ {item.homeTeamAbbreviation}
              </option>
            ))}
          </select>
        </div>
        <Label htmlFor="pick-reason">Reason, optional</Label>
        <Input id="pick-reason" name="reason" defaultValue={draft?.reason ?? ""} className="h-11" />
        <Button type="submit" className="h-11 w-fit">
          Review change
        </Button>
      </form>
    </section>
  );
}

function ResultCorrection({ leagueId, games }: { leagueId: string; games: NflGame[] }) {
  return (
    <form action={reviewResultFormAction} className="rounded-2xl border bg-card p-4">
      <input type="hidden" name="leagueId" value={leagueId} />
      <h2 className="font-medium">Correct a result</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Only if the imported score is wrong. A tie leaves every team pick incorrect.
      </p>
      <select name="gameId" className="mt-3 h-11 w-full rounded-xl border bg-background px-3" defaultValue={games[0]?.id}>
        {games.map((item) => (
          <option key={item.id} value={item.id}>
            {item.awayTeamAbbreviation} @ {item.homeTeamAbbreviation}
          </option>
        ))}
      </select>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Input name="away" inputMode="numeric" placeholder="Away" className="h-11" />
        <Input name="home" inputMode="numeric" placeholder="Home" className="h-11" />
        <select name="status" className="h-11 rounded-xl border bg-background px-2" defaultValue="final">
          <option value="final">Final</option>
          <option value="live">Live</option>
          <option value="scheduled">Scheduled</option>
          <option value="postponed">Postponed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <Input name="reason" placeholder="Reason" className="mt-3 h-11" />
      <Button type="submit" className="mt-3 h-11">
        Review result
      </Button>
    </form>
  );
}
