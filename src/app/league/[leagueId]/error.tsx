"use client";

import { Button } from "@/components/ui/button";

export default function LeagueError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-2xl border bg-card px-4 py-10 text-center">
      <h1 className="text-2xl tracking-tight">Something went wrong loading this league.</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error.message || "Try again."}</p>
      <Button className="mt-4 h-11" onClick={reset}>
        Retry
      </Button>
    </div>
  );
}
