"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  House,
  ListChecks,
  LayoutGrid,
  Trophy,
  MessageCircle,
  Menu,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { signOutAction } from "@/server/actions";
import { cn } from "cn";

const tabs = [
  { href: "", label: "Home", icon: House },
  { href: "/picks", label: "Picks", icon: ListChecks },
  { href: "/board", label: "Board", icon: LayoutGrid },
  { href: "/leaderboard", label: "Ranks", icon: Trophy },
  { href: "/chat", label: "Chat", icon: MessageCircle },
];

export function LeagueShell({
  leagueId,
  leagueName,
  displayName,
  role,
  children,
}: {
  leagueId: string;
  leagueName: string;
  displayName: string;
  role: "commissioner" | "member";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const base = `/league/${leagueId}`;

  return (
    <div className="min-h-full md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col border-r bg-card px-4 py-5 md:flex">
        <Logo href="/dashboard" />
        <p className="mt-6 truncate text-sm font-medium">{leagueName}</p>
        <p className="text-xs text-muted-foreground capitalize">{role}</p>
        <nav className="mt-6 grid gap-1">
          {tabs.map((tab) => {
            const href = `${base}${tab.href}`;
            const active = tab.href === "" ? pathname === base : pathname.startsWith(href);
            return (
              <Link
                key={tab.label}
                href={href}
                className={cn(
                  "rounded-xl px-3 py-2 text-sm",
                  active ? "bg-primary text-primary-foreground" : "hover:bg-secondary",
                )}
              >
                {tab.label === "Ranks" ? "Leaderboard" : tab.label === "Picks" ? "Make Picks" : tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto grid gap-1 text-sm">
          <Link className="rounded-xl px-3 py-2 hover:bg-secondary" href={`${base}/history`}>
            Week history
          </Link>
          <Link className="rounded-xl px-3 py-2 hover:bg-secondary" href={`${base}/settings`}>
            League settings
          </Link>
          <Link className="rounded-xl px-3 py-2 hover:bg-secondary" href="/account">
            {displayName}
          </Link>
          <form action={signOutAction}>
            <button className="w-full rounded-xl px-3 py-2 text-left hover:bg-secondary" type="submit">
              Log out
            </button>
          </form>
        </div>
      </aside>
      <div className="flex min-h-full min-w-0 flex-col pb-20 md:pb-0">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b bg-background/90 px-4 py-3 backdrop-blur md:hidden">
          <Logo href="/dashboard" compact />
          <p className="min-w-0 truncate text-sm font-medium">{leagueName}</p>
          <details className="relative">
            <summary
              aria-label="Open menu"
              className="flex size-11 cursor-pointer list-none items-center justify-center rounded-lg border bg-background [&::-webkit-details-marker]:hidden"
            >
              <Menu className="size-5" />
            </summary>
            <div className="absolute right-0 z-50 mt-2 w-56 rounded-xl border bg-card p-3 shadow-lg">
              <p className="px-2 pb-2 font-medium">{leagueName}</p>
              <div className="grid text-sm">
                <Link className="rounded-lg px-2 py-3 hover:bg-secondary" href={`${base}/history`}>
                  Week history
                </Link>
                <Link className="rounded-lg px-2 py-3 hover:bg-secondary" href={`${base}/settings`}>
                  League settings
                </Link>
                <Link className="rounded-lg px-2 py-3 hover:bg-secondary" href="/account">
                  Account · {displayName}
                </Link>
                <Link className="rounded-lg px-2 py-3 hover:bg-secondary" href="/dashboard">
                  All leagues
                </Link>
                <form action={signOutAction}>
                  <button className="w-full rounded-lg px-2 py-3 text-left hover:bg-secondary" type="submit">
                    Log out
                  </button>
                </form>
              </div>
            </div>
          </details>
        </header>
        <div className="mx-auto w-full min-w-0 max-w-6xl flex-1 px-4 py-5 sm:px-6">{children}</div>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-card md:hidden">
        {tabs.map((tab) => {
          const href = `${base}${tab.href}`;
          const active = tab.href === "" ? pathname === base : pathname.startsWith(href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.label}
              href={href}
              className={cn(
                "flex min-h-16 flex-col items-center justify-center gap-1 text-[11px]",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className="size-5" />
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
