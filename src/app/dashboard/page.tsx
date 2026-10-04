import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardPanel } from "@/components/dashboard-panel";
import { Logo } from "@/components/logo";
import { isDemoMode } from "@/lib/config";
import { getService } from "@/lib/db";
import { getCurrentProfile } from "@/lib/auth/current";
import { signOutAction } from "@/server/actions";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const query = await searchParams;
  const leagues = await (await getService()).listMyLeagues(profile.id);

  return (
    <main className="mx-auto min-h-full max-w-5xl px-4 py-6 sm:px-6">
      {isDemoMode() ? (
        <p className="mb-4 rounded-xl bg-accent px-3 py-2 text-sm">
          Demo mode. Sample league Sunday Sheet is ready. Sign in as Dylan or Alex to compare picks.
          Password for every sample account is pickem-demo.
        </p>
      ) : null}
      <header className="mb-8 flex items-center justify-between gap-3">
        <Logo />
        <div className="flex items-center gap-3 text-sm">
          <Link href="/account">{profile.displayName}</Link>
          <form action={signOutAction}>
            <button type="submit" className="text-muted-foreground">
              Log out
            </button>
          </form>
        </div>
      </header>
      <DashboardPanel leagues={leagues} demoMode={isDemoMode()} error={query.error} />
    </main>
  );
}
