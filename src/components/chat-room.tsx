"use client";

import { useEffect, useRef, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import type { ChatMessage } from "@/lib/domain/types";
import { loadMessagesAction, sendMessageFormAction } from "@/server/actions";
import { Button } from "@/components/ui/button";

export function ChatRoom({
  leagueId,
  initialMessages,
  realtime,
  serverError,
}: {
  leagueId: string;
  initialMessages: ChatMessage[];
  realtime: boolean;
  serverError?: string;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  useEffect(() => {
    let stop = false;
    const pull = async () => {
      try {
        const next = await loadMessagesAction(leagueId);
        if (!stop) setMessages(next);
      } catch {
        if (!stop) setError("Couldn't refresh chat. Retrying.");
      }
    };
    const timer = window.setInterval(() => void pull(), 4000);
    let channel: { unsubscribe: () => void } | null = null;
    if (realtime) {
      const supabase = createBrowserSupabase();
      if (supabase) {
        const subscription = supabase
          .channel(`league-messages-${leagueId}`)
          .on(
            "postgres_changes",
            {
              event: "INSERT",
              schema: "public",
              table: "league_messages",
              filter: `league_id=eq.${leagueId}`,
            },
            () => {
              void pull();
            },
          )
          .subscribe();
        channel = subscription;
      }
    }
    return () => {
      stop = true;
      window.clearInterval(timer);
      void channel?.unsubscribe();
    };
  }, [leagueId, realtime]);

  return (
    <div className="flex h-[calc(100dvh-9rem)] flex-col md:h-[calc(100dvh-4rem)]">
      <div>
        <h1 className="text-4xl tracking-tight">Chat</h1>
        <p className="text-sm text-muted-foreground">League members only. Keep it short.</p>
      </div>
      <div className="mt-4 flex-1 space-y-3 overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet. Say hello.</p>
        ) : (
          messages.map((message) => (
            <article key={message.id} className="rounded-2xl border bg-card px-3 py-2">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-sm font-medium">{message.displayName}</p>
                <time className="text-xs text-muted-foreground" dateTime={message.createdAt}>
                  {new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(message.createdAt))}
                </time>
              </div>
              <p className="mt-1 text-sm whitespace-pre-wrap">{message.message}</p>
            </article>
          ))
        )}
        <div ref={endRef} />
      </div>
      <form action={sendMessageFormAction} className="mt-3 flex gap-2">
        <input type="hidden" name="leagueId" value={leagueId} />
        <label className="sr-only" htmlFor="chat-message">
          Message
        </label>
        <input
          id="chat-message"
          name="message"
          required
          maxLength={1000}
          placeholder="Message the league"
          className="h-12 flex-1 rounded-xl border bg-card px-3"
        />
        <Button type="submit" className="h-12 px-4">
          Send
        </Button>
      </form>
      {error || serverError ? <p className="mt-2 text-sm text-destructive">{error || serverError}</p> : null}
    </div>
  );
}
