import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ availability: 'ready', locale: 'de', explore: vi.fn(), admin: vi.fn(), suggestions: vi.fn() }))
vi.mock('@/lib/server/journal-locale', () => ({ getJournalLocale: async () => state.locale }))
vi.mock('@/lib/server/auth', () => ({ getJournalAccess: async () => ({ user: { id: 'owner-a' } }) }))
vi.mock('@/lib/server/journal', () => ({ getSetupsSnapshotServer: async () => ({ availability: state.availability, tradeRows: [], tradeMediaRows: [], setupRows: [], setupMediaRows: [], setupTradeLinkRows: [], source: 'supabase' }) }))
vi.mock('@/lib/server/admin', () => ({ isEquoraAdminUser: state.admin }))
vi.mock('@/lib/server/setup-suggestions', () => ({ getSetupSuggestionsServer: state.suggestions }))
vi.mock('@/lib/server/performance', () => ({ measurePerformance: (_n: any, _k: any, run: any) => run(), measurePerformanceSync: (_n: any, _k: any, run: any) => run() }))
vi.mock('@/components/layout/app-shell', () => ({ AppShell: ({ children }: any) => <main>{children}</main> }))
vi.mock('@/components/setups/setup-explorer', () => ({ SetupExplorer: (p: any) => { state.explore(p); return <div>Setup-Bibliothek</div> } }))
vi.mock('@/components/setups/setup-studio', () => ({ SetupStudio: () => null }))
vi.mock('@/components/setups/setup-suggestion-card', () => ({ SetupSuggestionCard: () => null }))
import SetupsPage from '@/app/(journal)/setups/page'
beforeEach(() => { vi.clearAllMocks(); state.availability = 'ready'; state.locale = 'de'; state.admin.mockResolvedValue(false); state.suggestions.mockResolvedValue([]) })
it.each(['unavailable', 'unauthenticated'])('shows %s instead of apparently empty Setup results', async availability => {
  state.availability = availability
  const html = renderToStaticMarkup(await SetupsPage())
  expect(html).toContain('role="alert"')
  expect(html).toContain(availability === 'unauthenticated' ? 'href="/login"' : 'href="/setups"')
  expect(html).not.toContain('Setup-Bibliothek')
  expect(state.explore).not.toHaveBeenCalled()
  expect(state.admin).not.toHaveBeenCalled()
  expect(state.suggestions).not.toHaveBeenCalled()
})
it('renders the English error state before running setup analysis', async () => {
  state.locale = 'en'
  state.availability = 'unavailable'
  const html = renderToStaticMarkup(await SetupsPage())
  expect(html).toContain('Setups are currently unavailable')
  expect(html).toContain('>Reload</a>')
  expect(state.explore).not.toHaveBeenCalled()
})
it('allows genuine empty data and retains the template library', async () => {
  const html = renderToStaticMarkup(await SetupsPage())
  expect(html).not.toContain('role="alert"')
  expect(state.explore).toHaveBeenCalledTimes(1)
  expect(state.explore.mock.calls[0][0].trades).toEqual([])
  expect(state.explore.mock.calls[0][0].setupLibrary.length).toBeGreaterThan(0)
})
