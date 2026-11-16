import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import GlobalError from '@/app/error'
import GlobalLoading from '@/app/loading'
import NotFound from '@/app/not-found'
import ReviewCollectionsLoading from '@/app/(journal)/review-sessions/loading'
import TradesLoading from '@/app/(journal)/trades/loading'
import { JournalLocaleProvider } from '@/components/layout/journal-locale-provider'
import { JournalPageLoading } from '@/components/layout/journal-page-loading'
import { getJournalLocale } from '@/lib/server/journal-locale'

vi.mock('@/lib/server/journal-locale', () => ({ getJournalLocale: vi.fn() }))

describe('journal page language', () => {
  it.each([
    { locale: 'de', loading: 'Journal wird geladen', generic: 'Seite wird geladen', error: 'Die Seite konnte nicht geladen werden', retry: 'Erneut versuchen' },
    { locale: 'en', loading: 'Loading journal', generic: 'Loading page', error: 'This page could not be loaded', retry: 'Try again' },
  ] as const)('uses $locale for shared loading and error messages', ({ locale, loading, generic, error, retry }) => {
    const html = renderToStaticMarkup(
      <JournalLocaleProvider locale={locale}>
        <GlobalLoading />
        <JournalPageLoading />
        <GlobalError reset={() => {}} />
      </JournalLocaleProvider>,
    )

    expect(html).toContain('role="status"')
    expect(html).toContain(loading)
    expect(html).toContain(generic)
    expect(html).toContain('role="alert"')
    expect(html).toContain(error)
    expect(html).toContain(retry)
  })

  it('uses the saved language for page-specific loading labels and the 404 page', async () => {
    vi.mocked(getJournalLocale).mockResolvedValue('en')

    expect(renderToStaticMarkup(await TradesLoading())).toContain('Loading trades')
    expect(renderToStaticMarkup(await ReviewCollectionsLoading())).toContain('Loading review collections')
    const missing = renderToStaticMarkup(await NotFound())
    expect(missing).toContain('Page not found')
    expect(missing).toContain('href="/dashboard"')
  })
})
