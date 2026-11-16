import { redirect } from 'next/navigation'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { journalLanguages } from '@/lib/i18n/journal'
import { getJournalLocale, setJournalLocale } from '@/lib/server/journal-locale'

const settingsCopy = {
  de: {
    title: 'Einstellungen',
    language: 'Sprache',
    description: 'Wähle die Sprache für Equora in diesem Browser.',
    selected: 'Aktiv',
  },
  en: {
    title: 'Settings',
    language: 'Language',
    description: 'Choose the language for Equora in this browser.',
    selected: 'Active',
  },
}

async function changeLanguage(formData: FormData) {
  'use server'

  await setJournalLocale(formData.get('language'))
  redirect('/settings')
}

export default async function SettingsPage() {
  const locale = await getJournalLocale()
  const copy = settingsCopy[locale]

  return (
    <section lang={locale} className="max-w-2xl space-y-5">
      <h1 className="eq-display text-2xl font-semibold text-white sm:text-3xl">{copy.title}</h1>
      <FuturisticCard className="p-4 sm:p-6">
        <form action={changeLanguage}>
          <fieldset aria-describedby="journal-language-description" className="min-w-0">
            <legend className="text-base font-semibold text-white">{copy.language}</legend>
            <p id="journal-language-description" className="mt-2 text-sm text-white/70">{copy.description}</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {journalLanguages.map(({ code, name }) => {
                const isSelected = locale === code

                return (
                  <button
                    key={code}
                    type="submit"
                    name="language"
                    value={code}
                    aria-pressed={isSelected}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f0a855]/60 ${
                      isSelected
                        ? 'border-[#f0a855]/50 bg-[#f0a855]/10 text-white'
                        : 'border-white/15 text-white/75 hover:border-[#f0a855]/40 hover:text-white'
                    }`}
                  >
                    <span lang={code}>{name}</span>
                    {isSelected ? <span aria-hidden="true" className="text-xs text-[#f0a855]">{copy.selected}</span> : null}
                  </button>
                )
              })}
            </div>
          </fieldset>
        </form>
      </FuturisticCard>
    </section>
  )
}
