import { notFound, redirect } from "next/navigation";
import { LeagueShell } from "@/components/league-shell";
import { getCurrentProfile } from "@/lib/auth/current";
import { getService } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LeagueLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ leagueId: string }>;
}) {
  const { leagueId } = await params;
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const leagues = await (await getService()).listMyLeagues(profile.id);
  const league = leagues.find((item) => item.id === leagueId);
  if (!league) notFound();

  return (
    <LeagueShell
      leagueId={league.id}
      leagueName={league.name}
      displayName={profile.displayName}
      role={league.role}
    >
      {children}
    </LeagueShell>
  );
}
