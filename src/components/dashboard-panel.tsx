import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LeagueRole } from "@/lib/domain/types";
import { createLeagueFormAction, joinLeagueFormAction, resetDemoAction } from "@/server/actions";

export function DashboardPanel({
  leagues,
  demoMode,
  error,
}: {
  leagues: { id: string; name: string; seasonYear: number; role: LeagueRole; memberCount: number; inviteCode: string }[];
  demoMode: boolean;
  error?: string;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl tracking-tight">Your leagues</h1>
        <p className="text-sm text-muted-foreground">Open a league, or start a new sheet.</p>
      </div>
      {error ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <form action={createLeagueFormAction} className="rounded-xl border bg-card p-4">
          <Label htmlFor="league-name">New league</Label>
          <div className="mt-2 flex gap-2">
            <Input
              id="league-name"
              name="name"
              required
              minLength={3}
              maxLength={48}
              className="h-11"
              placeholder="Sunday Sheet"
            />
            <Button type="submit" className="h-11 shrink-0">
              Create league
            </Button>
          </div>
        </form>
        <form action={joinLeagueFormAction} className="rounded-xl border bg-card p-4">
          <Label htmlFor="invite-code">Invite code</Label>
          <div className="mt-2 flex gap-2">
            <Input
              id="invite-code"
              name="inviteCode"
              required
              className="h-11 uppercase"
              placeholder="K7R9Q2"
            />
            <Button type="submit" variant="outline" className="h-11 shrink-0">
              Join league
            </Button>
          </div>
        </form>
      </div>
      {leagues.length === 0 ? (
        <div className="rounded-xl border bg-card px-4 py-10 text-center">
          <p className="font-medium">Create or join a league to get started.</p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {leagues.map((league) => (
            <li key={league.id}>
              <Link href={`/league/${league.id}`} className="block rounded-xl border bg-card p-4 hover:bg-secondary">
                <p className="font-heading text-2xl tracking-tight">{league.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {league.seasonYear} · {league.memberCount} members · {league.role}
                </p>
                <p className="mt-3 text-sm">Open league</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {demoMode ? (
        <form action={resetDemoAction}>
          <Button type="submit" variant="outline">
            Reset sample data
          </Button>
        </form>
      ) : null}
    </div>
  );
}
