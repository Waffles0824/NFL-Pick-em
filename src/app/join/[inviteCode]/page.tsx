import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/auth/current";
import { getService } from "@/lib/db";
import { joinLeagueDirect } from "@/server/actions";

export const dynamic = "force-dynamic";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ inviteCode: string }>;
}) {
  const { inviteCode } = await params;
  const profile = await getCurrentProfile();
  const preview = await (await getService()).previewInvite(inviteCode, profile?.id ?? null);

  return (
    <main className="sheet-lines flex min-h-full items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border bg-card p-6">
        <Logo />
        {preview ? (
          <>
            <h1 className="mt-6 text-3xl tracking-tight">{preview.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {preview.seasonYear} season · {preview.memberCount} members
            </p>
            {profile ? (
              preview.alreadyMember ? (
                <Button asChild className="mt-6 h-11 w-full">
                  <Link href={`/league/${preview.leagueId}`}>Open league</Link>
                </Button>
              ) : (
                <form action={joinLeagueDirect} className="mt-6">
                  <input type="hidden" name="inviteCode" value={inviteCode} />
                  <Button type="submit" className="h-11 w-full">
                    Join league
                  </Button>
                </form>
              )
            ) : (
              <div className="mt-6 grid gap-2">
                <Button asChild className="h-11">
                  <Link href={`/signup?next=/join/${inviteCode}`}>Create an account to join</Link>
                </Button>
                <Button asChild variant="outline" className="h-11">
                  <Link href={`/login?next=/join/${inviteCode}`}>Log in</Link>
                </Button>
              </div>
            )}
          </>
        ) : (
          <>
            <h1 className="mt-6 text-3xl tracking-tight">Invite not found</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              That code does not match an active league.
            </p>
            <Button asChild className="mt-6 h-11" variant="outline">
              <Link href="/">Back home</Link>
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
