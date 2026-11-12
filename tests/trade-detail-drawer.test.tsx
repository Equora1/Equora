import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/components/trades/trade-detail-card', () => ({ TradeDetailCard: () => <div>Loaded detail card</div> }))
import { TradeDetailDrawer } from '@/components/trades/trade-detail-drawer'

const props = { tags: [], tagOptions: [], source: 'mock' as const, isLoading: true, onClose: () => {}, onDelete: () => {}, isDeleting: false }

describe('journal drawer states', () => {
  it('does not render a modal without an explicit detail ID', () => {
    expect(renderToStaticMarkup(<TradeDetailDrawer {...props} />)).toBe('')
  })
  it('shows a labelled loading state while requested details arrive', () => {
    const html = renderToStaticMarkup(<TradeDetailDrawer {...props} tradeId="a" />)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('Trade-Details werden geladen.')
    expect(html).toContain('aria-label="Detailansicht schließen"')
  })
  it('shows a dismissible error instead of an endless loading indicator', () => {
    const html = renderToStaticMarkup(<TradeDetailDrawer {...props} tradeId="a" error="Details nicht verfügbar" />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Details nicht verfügbar')
    expect(html).toContain('Zur Liste zurück')
    expect(html).not.toContain('Trade-Details werden geladen.')
    expect(html).not.toContain('Loaded detail card')
  })
})
