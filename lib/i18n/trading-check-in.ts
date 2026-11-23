import type { JournalLocale } from '@/lib/i18n/journal'
import type { CheckInQuestion } from '@/lib/utils/trading-check-in'

type QuestionText = {
  label: string
  question: string
  scale: readonly [string, string, string, string, string]
}

export const tradingCheckInCopy: Record<JournalLocale, Record<CheckInQuestion, QuestionText>> = {
  de: {
    recovery: {
      label: 'Erholung',
      question: 'Wie erholt fühlst du dich heute?',
      scale: ['Müde', 'Eher müde', 'Mittel', 'Ziemlich erholt', 'Ausgeruht'],
    },
    focus: {
      label: 'Fokus',
      question: 'Wie fokussiert fühlst du dich gerade?',
      scale: ['Abgelenkt', 'Eher abgelenkt', 'Mittel', 'Fokussiert', 'Voll fokussiert'],
    },
    previous_emotions: {
      label: 'Gefühle von gestern',
      question: 'Wie sehr wirken die Gefühle von gestern noch nach?',
      scale: ['Gar nicht', 'Wenig', 'Mittel', 'Deutlich', 'Sehr stark'],
    },
    trading_pressure: {
      label: 'Handelsdruck',
      question: 'Wie stark spürst du heute den Druck, unbedingt einen Trade zu machen?',
      scale: ['Gar kein Druck', 'Wenig Druck', 'Mittlerer Druck', 'Deutlicher Druck', 'Starker Druck'],
    },
    confidence: {
      label: 'Entscheidungssicherheit',
      question: 'Wie sicher hast du dich bei deinen Entscheidungen gefühlt?',
      scale: ['Unsicher', 'Eher unsicher', 'Mittel', 'Sicher', 'Sehr sicher'],
    },
    plan_adherence: {
      label: 'Plantreue',
      question: 'Wie gut hast du dich an deinen Plan gehalten?',
      scale: ['Gar nicht', 'Ein wenig', 'Etwa zur Hälfte', 'Größtenteils', 'Vollständig'],
    },
    entry_signal: {
      label: 'Einstiegssignal',
      question: 'Bei wie vielen Trades hast du dein geplantes Einstiegssignal abgewartet?',
      scale: ['Bei keinem', 'Bei wenigen', 'Bei etwa der Hälfte', 'Bei den meisten', 'Bei allen'],
    },
  },
  en: {
    recovery: {
      label: 'Rest',
      question: 'How rested do you feel today?',
      scale: ['Tired', 'Somewhat tired', 'In between', 'Fairly rested', 'Well rested'],
    },
    focus: {
      label: 'Focus',
      question: 'How focused do you feel right now?',
      scale: ['Distracted', 'Somewhat distracted', 'In between', 'Focused', 'Fully focused'],
    },
    previous_emotions: {
      label: 'Yesterday’s emotions',
      question: 'How much are yesterday’s emotions still affecting you?',
      scale: ['Not at all', 'A little', 'Moderately', 'Noticeably', 'A lot'],
    },
    trading_pressure: {
      label: 'Trading pressure',
      question: 'How much pressure do you feel to take a trade today?',
      scale: ['No pressure', 'A little pressure', 'Moderate pressure', 'Noticeable pressure', 'Strong pressure'],
    },
    confidence: {
      label: 'Confidence',
      question: 'How confident did you feel about your decisions?',
      scale: ['Unsure', 'Somewhat unsure', 'In between', 'Confident', 'Very confident'],
    },
    plan_adherence: {
      label: 'Following the plan',
      question: 'How closely did you follow your trading plan?',
      scale: ['Not at all', 'A little', 'About halfway', 'Mostly', 'Completely'],
    },
    entry_signal: {
      label: 'Entry signal',
      question: 'For how many trades did you wait for your planned entry signal?',
      scale: ['None', 'A few', 'About half', 'Most', 'All'],
    },
  },
}
