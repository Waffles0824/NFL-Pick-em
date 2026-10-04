"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { formatEt, formatInTimeZone, LEAGUE_TIME_ZONE } from "@/lib/domain/time";

function subscribeToNothing() {
  return () => {};
}

function localKickoffLabel(iso: string) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!zone || zone === LEAGUE_TIME_ZONE) return null;
  return formatInTimeZone(iso, zone);
}

export function KickoffTime({ iso, className }: { iso: string; className?: string }) {
  const eastern = formatEt(iso);
  const local = useSyncExternalStore(
    subscribeToNothing,
    () => localKickoffLabel(iso),
    () => null,
  );

  return (
    <span className={className}>
      {eastern}
      {local ? <span className="text-muted-foreground"> · {local}</span> : null}
    </span>
  );
}

export function LockCountdown({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const tick = () => {
      const diff = new Date(iso).getTime() - Date.now();
      if (diff <= 0) {
        setLabel("Locked");
        return;
      }
      const hours = Math.floor(diff / 3_600_000);
      const minutes = Math.floor((diff % 3_600_000) / 60_000);
      setLabel(hours > 48 ? `Locks in ${Math.floor(hours / 24)}d ${hours % 24}h` : `Locks in ${hours}h ${minutes}m`);
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, [iso]);

  return <span>{label ?? "Checking lock…"}</span>;
}
