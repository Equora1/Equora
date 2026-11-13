import type { JournalLocale } from '@/lib/i18n/journal'

export const quickCapturePrompts = [
  'Woran war der Entry für dich klar?',
  'Welcher Kontext hat den Trade getragen?',
  'Was war der erste kleine Warnhinweis?',
  'Was hat den Trade am stärksten geprägt?',
  'Würdest du den Trade so wieder nehmen?',
  'Was hat dich im Verlauf überrascht?',
] as const

const englishPrompts = [
  'What made the entry clear to you?',
  'What context supported the trade?',
  'What was the first warning sign?',
  'What mattered most in this trade?',
  'Would you take this trade again?',
  'What surprised you during the trade?',
] as const

export function getQuickCapturePrompt(index: number, locale: JournalLocale) {
  const prompts = locale === 'en' ? englishPrompts : quickCapturePrompts
  return prompts[index] ?? prompts[0]
}

export function getInitialQuickCapturePromptIndex(seed?: number) {
  if (!quickCapturePrompts.length) return 0
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return Math.abs(Math.floor(seed)) % quickCapturePrompts.length
  }

  return Math.floor(Math.random() * quickCapturePrompts.length)
}

export function getNextQuickCapturePromptIndex(currentIndex: number) {
  if (quickCapturePrompts.length <= 1) return 0

  const options = quickCapturePrompts
    .map((_, index) => index)
    .filter((index) => index !== currentIndex)

  return options[Math.floor(Math.random() * options.length)] ?? 0
}
