import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { getCurrentProfile } from "@/lib/auth/current";

export default async function HomePage() {
  const profile = await getCurrentProfile();
  if (profile) redirect("/dashboard");

  return (
    <main className="sheet-lines min-h-full">
      <div className="mx-auto flex min-h-full max-w-5xl flex-col px-5 py-6">
        <header className="flex items-center justify-between">
          <Logo />
          <div className="flex gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild className="h-10 px-4">
              <Link href="/signup">Sign up</Link>
            </Button>
          </div>
        </header>
        <section className="grid flex-1 items-center gap-10 py-16 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Private NFL pick&apos;em
            </p>
            <h1 className="mt-3 max-w-xl text-5xl leading-[1.05] tracking-tight sm:text-6xl">
              Pick the winner. That&apos;s the whole game.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-muted-foreground">
              A clean sheet for your group. One choice per regular-season game, a Monday total if
              you tie, and results that update when the games end. No spreads, no odds, no entry fee.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild className="h-11 px-5 text-base">
                <Link href="/signup">Create an account</Link>
              </Button>
              <Button asChild variant="outline" className="h-11 px-5 text-base">
                <Link href="/login">Log in</Link>
              </Button>
            </div>
          </div>
          <div className="rounded-3xl border bg-card p-5 shadow-sm">
            <p className="text-xs tracking-[0.16em] text-muted-foreground uppercase">Sunday · 1:00 PM ET</p>
            <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <div className="rounded-2xl border border-primary bg-primary/10 p-4">
                <p className="font-heading text-3xl">Eagles</p>
                <p className="text-sm text-muted-foreground">Philadelphia</p>
              </div>
              <span className="text-xs text-muted-foreground">vs</span>
              <div className="rounded-2xl border p-4">
                <p className="font-heading text-3xl">Cowboys</p>
                <p className="text-sm text-muted-foreground">Dallas</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">Saved. Locks at kickoff.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
