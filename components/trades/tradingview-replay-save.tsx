"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createTradingViewReplaySession, getTradingViewReplayOptions, saveTradingViewReplay } from "@/app/actions/tradingview-replay";
import { useJournalLocale } from "@/components/layout/journal-locale-provider";
import { journalText } from "@/lib/i18n/journal";
import type { ReplayRiskDraft } from "@/lib/utils/tradingview-replay-risk";
import { replaySaveFitsRequest } from "@/lib/utils/tradingview-replay-worksheet";

type SessionOption = { id: string; label: string };
type SaveResult = Awaited<ReturnType<typeof saveTradingViewReplay>>;

export function TradingViewReplaySave({ fileName, worksheetPayload, exportOffset, riskDrafts }: {
  fileName: string;
  worksheetPayload: string;
  exportOffset: string | null;
  riskDrafts: Record<number, ReplayRiskDraft>;
}) {
  const text = journalText(useJournalLocale());
  const choiceId = useId();
  const nameId = useId();
  const [options, setOptions] = useState<Awaited<ReturnType<typeof getTradingViewReplayOptions>>>();
  const [newSessions, setNewSessions] = useState<SessionOption[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [result, setResult] = useState<SaveResult>();
  const [createUnconfirmed, setCreateUnconfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    getTradingViewReplayOptions().then(
      (next) => { if (active) setOptions(next); },
      () => { if (active) setOptions({ status: "unavailable" }); },
    );
    return () => { active = false; };
  }, []);

  async function addSession() {
    if (!label.trim() || pending.current || createUnconfirmed) return;
    pending.current = true;
    setBusy(true);
    setResult(undefined);
    try {
      const next = await createTradingViewReplaySession(label);
      if (next.status === "created") {
        setNewSessions((sessions) => [{ id: next.id, label: next.label }, ...sessions]);
        setSessionId(next.id);
        setLabel("");
        setCreating(false);
      } else {
        setCreateUnconfirmed(true);
      }
    } catch {
      setCreateUnconfirmed(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function save() {
    if (!exportOffset || !sessionId || pending.current) return;
    const reviewedRisk = Object.entries(riskDrafts).map(([tradeNumber, draft]) => ({ tradeNumber: Number(tradeNumber), ...draft }));
    if (!replaySaveFitsRequest(worksheetPayload, reviewedRisk)) {
      setResult({ status: "invalid", reason: "request-too-large" });
      return;
    }
    pending.current = true;
    setBusy(true);
    setResult(undefined);
    try {
      setResult(await saveTradingViewReplay({
        sessionId, fileName, worksheetPayload, exportOffset,
        riskDrafts: reviewedRisk,
      }));
    } catch {
      setResult({ status: "unconfirmed" });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (options?.status !== "ready") {
    const message = options === undefined ? text("Replay-Sitzungen werden geladen …", "Loading Replay sessions…")
      : options.status === "sign_in" ? text("Melde dich an, um die Simulation zu speichern.", "Sign in to save the simulation.")
        : text("Die Replay-Speicherung ist derzeit nicht verfügbar.", "Replay saving is currently unavailable.");
    return <p role="status" className="text-sm text-white/65">{message}</p>;
  }

  const stored = result?.status === "imported" || result?.status === "already_imported";
  const feedback = result?.status === "imported" ? text("Replay im Journal gespeichert.", "Replay saved to the journal.")
    : result?.status === "already_imported" ? text("Dieser Import ist bereits gespeichert.", "This import is already saved.")
      : result?.status === "conflict" ? text("Für diese Sitzung ist bereits ein anderer Export gespeichert.", "This session already contains a different export.")
        : result?.status === "invalid" ? (result.reason === "request-too-large"
          ? text("Der Import ist zu groß. Exportiere eine kürzere Replay-Sitzung.", "The import is too large. Export a shorter Replay session.")
          : text("Prüfe die Exportzeiten und die Angaben unter „Stop & Ziel“.", "Check the export times and the values under “Stop & target”."))
          : result?.status === "session_unavailable" ? text("Diese Replay-Sitzung ist nicht verfügbar.", "This Replay session is unavailable.")
            : result ? text("Speicherung nicht bestätigt. Versuche es mit derselben Sitzung erneut.", "Saving could not be confirmed. Retry with the same session.") : null;
  const control = "rounded-lg border border-white/20 bg-[var(--eq-bg)] px-2 py-1.5 text-sm";

  return (
    <section className="space-y-3 border-t border-white/10 pt-4 text-sm" aria-label={text("Simulation speichern", "Save simulation")}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="block" htmlFor={choiceId}>{text("Replay-Sitzung", "Replay session")}</label>
          <select id={choiceId} value={sessionId} disabled={busy} className={control} onChange={(event) => {
            setSessionId(event.target.value);
            setResult(undefined);
          }}>
            <option value="">{text("Sitzung wählen", "Choose a session")}</option>
            {[...newSessions, ...options.sessions].map((session) => <option key={session.id} value={session.id}>{session.label}</option>)}
          </select>
        </div>
        <button type="button" disabled={busy} className={control} onClick={() => setCreating((open) => !open)}>
          {text("Neue Sitzung", "New session")}
        </button>
        <button type="button" disabled={!sessionId || !exportOffset || busy || stored} className={`${control} disabled:opacity-50`} onClick={() => void save()}>
          {text("Simulation speichern", "Save simulation")}
        </button>
      </div>
      {creating ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="block" htmlFor={nameId}>{text("Name der Replay-Sitzung", "Replay session name")}</label>
            <input id={nameId} maxLength={120} value={label} disabled={busy || createUnconfirmed} className={control} onChange={(event) => setLabel(event.target.value)} />
          </div>
          <button type="button" disabled={!label.trim() || busy || createUnconfirmed} className={`${control} disabled:opacity-50`} onClick={() => void addSession()}>
            {text("Sitzung anlegen", "Create session")}
          </button>
        </div>
      ) : null}
      {!exportOffset ? <p className="text-white/65">{text("Gib zum Speichern den UTC-Offset des Exports an.", "Enter the export UTC offset before saving.")}</p> : null}
      {createUnconfirmed ? <p role="status">{text("Das Anlegen wurde nicht bestätigt. Prüfe die Sitzungen im Replay-Journal.", "Creation could not be confirmed. Check the sessions in the Replay journal.")}</p> : null}
      {feedback ? <p role="status">{feedback}</p> : null}
      <Link className="inline-block underline" href={stored ? `/replay?session=${result.sessionId}` : "/replay"}>
        {text("Replay-Journal öffnen", "Open Replay journal")}
      </Link>
    </section>
  );
}
