import "server-only";
import { hasSupabaseServerEnv } from "@/lib/supabase/config";
import { createSupabaseAuthServerClient } from "@/lib/supabase/server-auth";

export function replayStorageEnabled() {
  return process.env.EQUORA_TRADINGVIEW_REPLAY_STORAGE === "enabled" && hasSupabaseServerEnv();
}

export async function readReplaySessionOptions(userId: string) {
  const client = await createSupabaseAuthServerClient();
  const { data, error } = await client.from("journal_replay_sessions")
    .select("id,label")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .order("id")
    .limit(100)
    .returns<{ id: string; label: string }[]>();
  return error ? null : data;
}
