import { hasSupabaseClientEnv } from '@/lib/supabase/config'
import type { DailyNoteRow, SetupRow } from '@/lib/types/db'
import type { Trade } from '@/lib/types/trade'
import { getTradeTrustSummary } from '@/lib/utils/trade-trust'

export type FirstUserStepStatus = 'done' | 'current' | 'next'

export type FirstUserStep = {
  label: string
  value: string
  detail: string
  status: FirstUserStepStatus
  href?: string
  cta?: string
}

export type FirstUserOnboardingStage =
  | 'connect'
  | 'login'
  | 'setup'
  | 'capture'
  | 'complete'
  | 'review'
  | 'rolling'

export type FirstUserOnboarding = {
  stage: FirstUserOnboardingStage
  title: string
  copy: string
  badge: string
  completionPercent: number
  showCard: boolean
  nextActionLabel?: string
  nextActionHref?: string
  nextActionCta?: string
  steps: FirstUserStep[]
}

function toStatus(index: number, currentIndex: number): FirstUserStepStatus {
  if (index < currentIndex) return 'done'
  if (index === currentIndex) return 'current'
  return 'next'
}

export function getFirstUserOnboarding({
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
}): FirstUserOnboarding {
  const hasClientEnv = hasSupabaseClientEnv()
  const hasLiveSession = source === 'supabase' && Boolean(userId)
  const personalSetupCount = setups.filter((setup) => Boolean(setup.created_at)).length
  const hasSetups = personalSetupCount > 0
  const hasTrades = trades.length > 0
  const trust = getTradeTrustSummary(trades)
  const hasTrustedTrade = trust.trustedTrades > 0
  const hasReviewSeed = dailyNotes.length > 0 || trades.length >= 3

  let stage: FirstUserOnboardingStage = 'rolling'
  let currentIndex = 6

  if (!hasClientEnv) {
    stage = 'connect'
    currentIndex = 0
  } else if (!hasLiveSession) {
    stage = 'login'
    currentIndex = 1
  } else if (!hasSetups) {
    stage = 'setup'
    currentIndex = 2
  } else if (!hasTrades) {
    stage = 'capture'
    currentIndex = 3
  } else if (!hasTrustedTrade) {
    stage = 'complete'
    currentIndex = 4
  } else if (!hasReviewSeed) {
    stage = 'review'
    currentIndex = 5
  }

  const steps: FirstUserStep[] = [
    {
      label: 'Supabase live',
      value: hasClientEnv ? 'Verbunden' : 'Noch Demo',
      detail: hasClientEnv
        ? 'Supabase ist als echter Datenpfad vorbereitet. Konto, Auth und RLS können live genutzt werden.'
        : 'Die Oberfläche läuft noch im Demo-Modus. Für echte Nutzer zuerst die Supabase-Env-Werte setzen.',
      status: toStatus(0, currentIndex),
      href: '/login',
      cta: hasClientEnv ? 'Login öffnen' : 'Env vorbereiten',
    },
    {
      label: 'Persönlicher Login',
      value: hasLiveSession ? 'Aktiv' : 'Offen',
      detail: hasLiveSession
        ? 'Der Journal-Pfad ist an den eingeloggten Nutzer gebunden statt an Demo-Daten.'
        : 'Ohne aktiven Login landet noch nichts sauber im persönlichen Konto.',
      status: toStatus(1, currentIndex),
      href: '/login',
      cta: 'Einloggen',
    },
    {
      label: 'Setup-Vokabular',
      value: hasSetups ? `${personalSetupCount} Setups` : 'Noch leer',
      detail: hasSetups
        ? 'Markt und Setup sprechen bereits dieselbe Sprache. Das macht Quick Capture, Statistik und Review konsistent.'
        : 'Ein bis zwei persönliche Setups reichen schon, damit das Journal nicht nur aus Freitext besteht.',
      status: toStatus(2, currentIndex),
      href: '/setups',
      cta: hasSetups ? 'Setups ansehen' : 'Setup auswählen',
    },
    {
      label: 'Erster Capture',
      value: hasTrades ? `${trades.length} Trades` : 'Noch kein Trade',
      detail: hasTrades
        ? 'Der erste Journal-Kreislauf lebt bereits. Trades tauchen im persönlichen Verlauf wieder auf.'
        : 'Quick Capture ist der schnellste Start. Erst sichern, Details später.',
      status: toStatus(3, currentIndex),
      href: '/trades',
      cta: hasTrades ? 'Trades öffnen' : 'Ersten Trade erfassen',
    },
    {
      label: 'Belastbare P&L',
      value: hasTrustedTrade ? `${trust.trustedTrades} belastbar` : 'Noch offen',
      detail: hasTrustedTrade
        ? `${Math.round(trust.trustedCoverage)}% Coverage. Dashboard und Kurven haben belastbaren Boden.`
        : trust.incompleteTrades > 0
          ? `${trust.incompleteTrades} Quick Captures warten noch auf Vervollständigung.`
          : 'Mindestens ein vollständiger Trade macht aus Aktivität endlich verwertbare Kennzahlen.',
      status: toStatus(4, currentIndex),
      href: '/trades',
      cta: hasTrustedTrade ? 'Datenbasis prüfen' : 'Trade vervollständigen',
    },
    {
      label: 'Review-Material',
      value: hasReviewSeed ? 'Bereit' : 'Noch dünn',
      detail: hasReviewSeed
        ? 'Es gibt genug Stoff für Review, Fokus des Tages und erste Muster.'
        : 'Drei Trades oder eine Daily Note reichen bereits, damit Review nicht im Leerlauf läuft.',
      status: toStatus(5, currentIndex),
      href: hasReviewSeed ? '/review' : '/trades',
      cta: hasReviewSeed ? 'Review öffnen' : 'Noch 1-2 Trades',
    },
  ]

  const doneCount = steps.filter((step) => step.status === 'done').length
  const completionPercent = Math.round((doneCount / steps.length) * 100)

  let title = 'Equora führt jetzt bis zum ersten echten Review-Moment'
  let copy = 'Ein neuer Nutzer sollte nicht rätseln, sondern die nächsten zwei bis drei Schritte sofort sehen.'
  let nextActionLabel = 'Review-Material aufbauen'
  let nextActionHref = '/trades'
  let nextActionCta = 'Weiter zu Trades'

  switch (stage) {
    case 'connect':
      title = 'Zuerst Supabase scharf schalten'
      copy = 'Das Konto ist angelegt. Jetzt fehlen nur die Env-Werte, damit aus Demo ein persönlicher Journal-Pfad wird.'
      nextActionLabel = 'Supabase-Env setzen'
      nextActionHref = '/login'
      nextActionCta = 'Login/Status ansehen'
      break
    case 'login':
      title = 'Jetzt den echten User-Pfad betreten'
      copy = 'Supabase steht. Der nächste Schritt ist ein echter Login, damit Trades, Tags und Reviews sauber im eigenen Konto landen.'
      nextActionLabel = 'Mit dem eigenen Konto einloggen'
      nextActionHref = '/login'
      nextActionCta = 'Zu Login'
      break
    case 'setup':
      title = 'Ein kleines Setup-Vokabular reicht für den Start'
      copy = 'Schon ein oder zwei klare Setup-Namen machen Quick Capture, Filter und spätere Reviews deutlich nützlicher.'
      nextActionLabel = 'Erstes persönliches Setup festlegen'
      nextActionHref = '/setups'
      nextActionCta = 'Zu Setups'
      break
    case 'capture':
      title = 'Jetzt den ersten echten Trade durchs Journal schicken'
      copy = 'Der wichtigste Test ist keine Theorie. Trade speichern, wiederfinden und später ergänzen. Genau dort entscheidet sich Produktgefühl.'
      nextActionLabel = 'Ersten Trade per Quick Capture sichern'
      nextActionHref = '/trades'
      nextActionCta = 'Zu Trades'
      break
    case 'complete':
      title = 'Quick Capture steht. Jetzt braucht Equora den ersten belastbaren Trade'
      copy = 'Sobald ein Trade vollständig ist, werden Dashboard, Kurven und Review vom hübschen Schaufenster zum brauchbaren Cockpit.'
      nextActionLabel = 'Ersten unvollständigen Trade vervollständigen'
      nextActionHref = '/trades'
      nextActionCta = 'Trade fertig machen'
      break
    case 'review':
      title = 'Der Datenfluss lebt, jetzt fehlt nur noch Review-Futter'
      copy = 'Noch ein paar Trades oder eine Daily Note, dann kann Equora bereits echte Muster und Warnsignale zeigen.'
      nextActionLabel = 'Noch 1-2 Trades oder eine Daily Note ergänzen'
      nextActionHref = '/review'
      nextActionCta = 'Review prüfen'
      break
    case 'rolling':
      title = 'Der erste Nutzerpfad steht jetzt auf eigenen Beinen'
      copy = 'Ab hier geht es nicht mehr um Erstkontakt, sondern um Gewohnheit, Vertrauen und Reibung rausnehmen.'
      nextActionLabel = 'Review und Feinschliff vertiefen'
      nextActionHref = '/review'
      nextActionCta = 'Zu Review'
      break
  }

  return {
    stage,
    title,
    copy,
    badge: `${doneCount}/${steps.length} Schritte`,
    completionPercent,
    showCard: stage !== 'rolling',
    nextActionLabel,
    nextActionHref,
    nextActionCta,
    steps,
  }
}
