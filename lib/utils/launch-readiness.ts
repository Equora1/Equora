import { hasSupabaseClientEnv, hasSupabaseServerEnv } from '@/lib/supabase/config'
import type { DailyNoteRow, SetupRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { getTradeTrustSummary } from '@/lib/utils/trade-trust'

export type LaunchStepStatus = 'done' | 'warning' | 'blocked'

export type LaunchStep = {
  label: string
  value: string
  detail: string
  status: LaunchStepStatus
  href?: string
  cta?: string
}

export type LaunchReadiness = {
  title: string
  copy: string
  badge: string
  readyCount: number
  totalCount: number
  steps: LaunchStep[]
}

function createStep(step: LaunchStep) {
  return step
}

function countReadySteps(steps: LaunchStep[]) {
  return steps.filter((step) => step.status === 'done').length
}

export function getLaunchReadiness({
  source,
  userId,
  trades,
  setups,
  dailyNotes,
}: {
  source: 'supabase' | 'mock'
  userId?: string | null
  trades: Trade[]
  setups: SetupRow[]
  dailyNotes: DailyNoteRow[]
}): LaunchReadiness {
  const trust = getTradeTrustSummary(trades)
  const hasClientEnv = hasSupabaseClientEnv()
  const hasServerEnv = hasSupabaseServerEnv()
  const hasLiveSession = source === 'supabase' && Boolean(userId)
  const personalSetupCount = setups.filter((setup) => Boolean(setup.created_at)).length
  const hasReviewSeed = dailyNotes.length > 0 || trades.length >= 3

  const steps: LaunchStep[] = [
    createStep(
      hasClientEnv
        ? {
            label: 'Supabase Client',
            value: 'Verbunden',
            detail: hasServerEnv
              ? 'URL, Anon Key und Server Key sind gesetzt. Auth und Server-Actions können live laufen.'
              : 'Client-Pfad steht. Für robuste Server-Actions fehlt nur noch der Server-Key.',
            status: hasServerEnv ? 'done' : 'warning',
          }
        : {
            label: 'Supabase Client',
            value: 'Noch im Demo-Modus',
            detail: 'Ohne Env-Werte läuft Equora weiter mit Mock-Daten. Für Deploy zuerst die Supabase-Variablen setzen.',
            status: 'blocked',
          },
    ),
    createStep(
      hasLiveSession
        ? {
            label: 'Nutzer-Login',
            value: 'Eingeloggt',
            detail: 'Dashboard, Trades und Reviews laufen bereits im user-gebundenen Pfad statt im offenen Demo-Nebel.',
            status: 'done',
          }
        : hasClientEnv
          ? {
              label: 'Nutzer-Login',
              value: 'Login noch offen',
              detail: 'Supabase ist angebunden, aber ohne aktive Session bleibt der persönliche Journal-Pfad noch unberührt.',
              status: 'warning',
              href: '/login',
              cta: 'Zu Login',
            }
          : {
              label: 'Nutzer-Login',
              value: 'Wartet auf Live-Auth',
              detail: 'Sobald Supabase env gesetzt ist, springt Equora von Demo auf echten Login-Flow um.',
              status: 'blocked',
            },
    ),
    createStep(
      hasLiveSession
        ? {
            label: 'Live-Datenpfad',
            value: 'Persönlicher Modus aktiv',
            detail: 'Reads laufen im Scope des eingeloggten Users. RLS und user_id bilden die Leitplanke für echte Deployments.',
            status: 'done',
          }
        : hasClientEnv
          ? {
              label: 'Live-Datenpfad',
              value: 'Fast bereit',
              detail: 'Die Infrastruktur steht. Es fehlt nur die aktive Session, damit Trades wirklich im persönlichen Konto landen.',
              status: 'warning',
            }
          : {
              label: 'Live-Datenpfad',
              value: 'Noch nicht scharf',
              detail: 'Der user-gebundene Supabase-Pfad ist vorbereitet, aber ohne Env-Werte noch nicht aktiv.',
              status: 'blocked',
            },
    ),
    createStep(
      personalSetupCount > 0
        ? {
            label: 'Setup-Vokabular',
            value: `${personalSetupCount} Setups verfügbar`,
            detail: 'Der Nutzer hat bereits eine Basis, damit Quick Capture und spätere Reviews denselben Wortschatz sprechen.',
            status: 'done',
            href: '/setups',
            cta: 'Setups ansehen',
          }
        : {
            label: 'Setup-Vokabular',
            value: 'Noch leer',
            detail: 'Mindestens ein bis zwei Setups geben dem Journal Struktur, bevor alles in Freitext zerfließt.',
            status: 'warning',
            href: '/setups',
            cta: 'Setups anlegen',
          },
    ),
    createStep(
      trades.length > 0
        ? {
            label: 'Erster Capture-Flow',
            value: `${trades.length} Trades erfasst`,
            detail: trust.incompleteTrades > 0
              ? `${trust.incompleteTrades} Quick Captures warten noch auf Vervollständigung.`
              : 'Der Nutzer hat bereits echte Einträge im Journal und nicht nur eine hübsche Startseite.',
            status: 'done',
            href: '/trades',
            cta: 'Trades öffnen',
          }
        : {
            label: 'Erster Capture-Flow',
            value: 'Noch kein Trade',
            detail: 'Jetzt zählt weniger Perfektion als Reibung. Der Quick-Capture-Flow sollte den ersten echten Eintrag tragen.',
            status: 'warning',
            href: '/trades',
            cta: 'Ersten Trade erfassen',
          },
    ),
    createStep(
      trust.trustedTrades > 0
        ? {
            label: 'Belastbare P&L-Basis',
            value: `${trust.trustedTrades} belastbare Trades`,
            detail: `${Math.round(trust.trustedCoverage)}% Coverage. Kurven und Kernstats haben bereits belastbaren Untergrund.`,
            status: 'done',
            href: '/trades',
            cta: 'Belastbare Trades prüfen',
          }
        : trades.length > 0
          ? {
              label: 'Belastbare P&L-Basis',
              value: 'Trades da, aber noch nicht belastbar',
              detail: 'Quick Captures sind Gold für Geschwindigkeit, aber erst vollständige P&L macht Dashboard und Review wirklich vertrauenswürdig.',
              status: 'warning',
              href: '/trades',
              cta: 'Trades vervollständigen',
            }
          : {
              label: 'Belastbare P&L-Basis',
              value: 'Noch kein Signal',
              detail: 'Ohne mindestens einen belastbaren Trade bleibt die Equity-Kurve stumm wie ein Monitor ohne Strom.',
              status: 'warning',
              href: '/trades',
              cta: 'P&L-Basis starten',
            },
    ),
    createStep(
      hasReviewSeed
        ? {
            label: 'Review-Futter',
            value: dailyNotes.length > 0 ? `${dailyNotes.length} Daily Notes als Basis` : `${trades.length} Trades als Basis`,
            detail: dailyNotes.length > 0
              ? 'Tagesnotizen liegen schon bereit und geben dem Fokus des Tages echten Kontext.'
              : 'Auch ohne Daily Notes ist genug Material da, damit Review und Statistik nicht im Vakuum arbeiten.',
            status: 'done',
            href: dailyNotes.length > 0 ? '/kalender' : '/review',
            cta: dailyNotes.length > 0 ? 'Daily Notes ansehen' : 'Review öffnen',
          }
        : {
            label: 'Review-Futter',
            value: 'Noch dünn',
            detail: 'Für echte Review-Muster braucht Equora ein paar Trades oder eine Daily Note. Sonst bleibt die Analyse nur Theorie.',
            status: 'warning',
            href: '/review',
            cta: 'Review vorbereiten',
          },
    ),
  ]

  const readyCount = countReadySteps(steps)
  const totalCount = steps.length

  let title = 'Startklar: Der erste Nutzerfluss steht'
  let copy = 'Die Basis für den ersten echten User ist gelegt. Jetzt geht es vor allem um Reibung rausnehmen und Feedback einsammeln.'

  if (!hasClientEnv) {
    title = 'Vor dem Deploy: Supabase live schalten'
    copy = 'Equora kann schon glänzen, aber noch im Demo-Modus. Erst mit echten Env-Werten wird daraus ein persönlicher Trading-Desk statt Schaufenster.'
  } else if (!hasLiveSession) {
    title = 'Fast live: Einloggen und den User-Pfad testen'
    copy = 'Die Technik steht fast vollständig. Der nächste Schritt ist der echte Auth- und Datenfluss mit einem realen Konto.'
  } else if (trades.length === 0) {
    title = 'Erster Real-User-Flow: den ersten Trade durchjagen'
    copy = 'Ab hier zählt Praxis. Quick Capture, Trade speichern, wiederfinden, vervollständigen. Genau dieser Kreislauf entscheidet über Produktgefühl.'
  } else if (trust.trustedTrades === 0) {
    title = 'Quick Capture steht, jetzt Datenbasis nachziehen'
    copy = 'Der erste Datenfluss lebt, aber die Kennzahlen brauchen mindestens einen wirklich vollständigen Trade, damit das Dashboard nicht nur hübsch klingt.'
  } else if (trust.trustedCoverage < 70) {
    title = 'Launchfähig, aber die Datenbasis ist noch ausbaufähig'
    copy = 'Die App funktioniert bereits mit echten Daten. Jetzt lohnt es sich, Quick Captures sauber zu vervollständigen, damit Kurven und Reviews stabil bleiben.'
  }

  return {
    title,
    copy,
    badge: `${readyCount}/${totalCount} bereit`,
    readyCount,
    totalCount,
    steps,
  }
}
