"use server";

import { getCurrentUser } from "@/lib/server/auth";
import { prepareTradingViewReplayImport } from "@/lib/server/tradingview-replay-import";
import { readReplaySessionOptions, replayStorageEnabled } from "@/lib/server/tradingview-replay-storage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decodeReplayWorksheet, isReplaySessionId, replaySaveFitsRequest } from "@/lib/utils/tradingview-replay-worksheet";

type RiskDraft = { tradeNumber: number; stopLoss: string; takeProfit: string };
type ReplaySubmission = {
  sessionId: string;
  fileName: string;
  worksheetPayload: string;
  exportOffset: string;
  riskDrafts: RiskDraft[];
};

function validRiskDraft(draft: unknown): draft is RiskDraft {
  if (!draft || typeof draft !== "object") return false;
  const value = draft as Partial<RiskDraft>;
  return Number.isSafeInteger(value.tradeNumber) && typeof value.stopLoss === "string"
    && typeof value.takeProfit === "string" && value.stopLoss.length <= 64 && value.takeProfit.length <= 64;
}

export async function getTradingViewReplayOptions() {
  if (!replayStorageEnabled()) return { status: "disabled" } as const;
  const user = await getCurrentUser();
  if (!user) return { status: "sign_in" } as const;
  try {
    const sessions = await readReplaySessionOptions(user.id);
    return sessions ? { status: "ready", sessions } as const : { status: "unavailable" } as const;
  } catch {
    return { status: "unavailable" } as const;
  }
}

export async function createTradingViewReplaySession(label: string) {
  if (!replayStorageEnabled()) return { status: "disabled" } as const;
  const user = await getCurrentUser();
  if (!user) return { status: "sign_in" } as const;
  const cleaned = typeof label === "string" ? label.trim() : "";
  if (!cleaned || cleaned.length > 120 || /[\x00-\x1f\x7f]/.test(cleaned)) {
    return { status: "invalid_label" } as const;
  }
  try {
    const { data, error } = await createSupabaseServerClient().rpc("journal_create_replay_session_v1", {
      p_user_id: user.id, p_label: cleaned,
    });
    if (!error && isReplaySessionId(data)) return { status: "created", id: data, label: cleaned } as const;
  } catch {
    // The user can reopen their session list to check whether creation succeeded.
  }
  return { status: "unconfirmed" } as const;
}

export async function saveTradingViewReplay(input: ReplaySubmission) {
  if (!replayStorageEnabled()) return { status: "disabled" } as const;
  const user = await getCurrentUser();
  if (!user) return { status: "sign_in" } as const;
  if (!input || !isReplaySessionId(input.sessionId) || typeof input.fileName !== "string"
    || typeof input.worksheetPayload !== "string"
    || typeof input.exportOffset !== "string" || input.exportOffset.length > 16
    || !Array.isArray(input.riskDrafts) || input.riskDrafts.length > 2500 || !input.riskDrafts.every(validRiskDraft)) {
    return { status: "invalid", reason: "invalid-request" } as const;
  }
  if (!replaySaveFitsRequest(input.worksheetPayload, input.riskDrafts)) {
    return { status: "invalid", reason: "request-too-large" } as const;
  }
  const worksheet = decodeReplayWorksheet(input.worksheetPayload);
  if (!worksheet) return { status: "invalid", reason: "invalid-worksheet" } as const;
  const prepared = prepareTradingViewReplayImport({
    sessionId: input.sessionId, fileName: input.fileName, exportOffset: input.exportOffset,
    worksheet, riskDrafts: input.riskDrafts,
  });
  if (!prepared.ok) return { status: "invalid", reason: prepared.reason } as const;
  try {
    const { data, error } = await createSupabaseServerClient().rpc("journal_save_replay_import_v1", {
      p_user_id: user.id, p_batch: prepared.batch,
    });
    if (error?.code === "42501") return { status: "session_unavailable" } as const;
    if (!error && data?.sessionId === input.sessionId) {
      if (data.status === "imported" || data.status === "already_imported" || data.status === "conflict") {
        const status: "imported" | "already_imported" | "conflict" = data.status;
        return { status, sessionId: input.sessionId };
      }
    }
  } catch {
    // Retry with the same session so PostgreSQL can resolve an uncertain commit.
  }
  return { status: "unconfirmed" } as const;
}
