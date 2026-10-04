import { notFound } from "next/navigation";
import { ChatRoom } from "@/components/chat-room";
import { isSupabaseConfigured } from "@/lib/config";
import { getCurrentProfile } from "@/lib/auth/current";
import { getService } from "@/lib/db";
import { loadLeaguePage } from "@/server/league-page";

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ leagueId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { leagueId } = await params;
  const query = await searchParams;
  const profile = await getCurrentProfile();
  if (!profile) notFound();
  const messages = await loadLeaguePage(async () =>
    (await getService()).listMessages(profile.id, leagueId),
  );
  return (
    <ChatRoom
      leagueId={leagueId}
      initialMessages={messages}
      realtime={isSupabaseConfigured()}
      serverError={query.error}
    />
  );
}
