import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { TradeCurrencyQualityPanel } from '@/components/trades/trade-currency-quality-panel'

describe('currency review panel', () => {
  it('describes global scope and keeps missing and unsupported units distinct', () => {
    const html = renderToStaticMarkup(<TradeCurrencyQualityPanel summary={{ total: 100, known: 70, missing: 25, unsupported: 5, needsReview: 30 }} selected="Fehlt" onChange={() => {}} />)
    expect(html).toContain('aria-label="Währungsangaben prüfen"')
    expect(html).toContain('Im gesamten Journal: 30 von 100')
    expect(html).toContain('Währung fehlt (25)')
    expect(html).toContain('Währung nicht unterstützt (5)')
    expect(html).toContain('Prüffilter aufheben')
    expect(html).toContain('USD, USDT und USDC sind unterschiedliche Einheiten')
  })
  it('hides when there are no issues but keeps an empty active filter clearable', () => {
    const summary = { total: 2, known: 2, missing: 0, unsupported: 0, needsReview: 0 }
    expect(renderToStaticMarkup(<TradeCurrencyQualityPanel summary={summary} selected="Alle" onChange={() => {}} />)).toBe('')
    expect(renderToStaticMarkup(<TradeCurrencyQualityPanel summary={summary} selected="Fehlt" onChange={() => {}} />)).toContain('Prüffilter aufheben')
  })
})
