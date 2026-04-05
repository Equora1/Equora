import type { DailyNoteRow, SetupRow } from '@/lib/types/db'
import type { SetupDetailMap, SetupLibraryItem } from '@/lib/types/setup'
import type { Trade, TradeDetail } from '@/lib/types/trade'
import { getSetupImagePath, getTradeScreenshotPath } from '@/lib/utils/storage-paths'

export const setupLibrary: SetupLibraryItem[] = [
  { category: 'SMC', title: 'Order Block Retest', description: 'Rücklauf in einen klaren Order Block mit Struktur-Bestätigung.' },
  { category: 'SMC', title: 'Liquidity Sweep', description: 'Stop-Hunt über Hoch oder Tief, danach Rejection und Entry.' },
  { category: 'SMC', title: 'Fair Value Gap Fill', description: 'Entry nach Reaktion in ineffizientem Bereich mit Bestätigung.' },
  { category: 'Price Action', title: 'Breakout Pullback', description: 'Ausbruch mit kontrolliertem Rücklauf an Schlüsselzone.' },
  { category: 'Momentum', title: 'Opening Range Expansion', description: 'Impulsiver Schub aus der Eröffnungsrange mit Volumenbestätigung.' },
  { category: 'Mean Reversion', title: 'VWAP Reclaim', description: 'Rückkehr an den Durchschnitt nach Überdehnung mit sauberer Reaktion.' },
]

export const setupRows: SetupRow[] = setupLibrary.map((setup, index) => ({
  id: `setup-${index + 1}`,
  user_id: 'demo-user',
  title: setup.title,
  category: setup.category,
  description: setup.description,
  playbook: index === 1 ? 'Sweep, Reclaim, Trigger. Nur mit Kontext und Bestätigung.' : null,
  checklist: index === 1 ? ['Sweep sichtbar', 'Reclaim bestätigt', 'Entry nicht gechased'] : [],
  mistakes: [],
  cover_image_url: null,
  sort_order: index,
  is_archived: false,
  created_at: `2026-03-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
  updated_at: `2026-03-${String(index + 1).padStart(2, '0')}T08:00:00.000Z`,
}))

export const setupDetails: SetupDetailMap = {
  'Liquidity Sweep': { category: 'SMC', entry: 'Sweep eines klaren Hochs oder Tiefs, danach Rejection und Trigger-Kerze.', exit: 'TP an Gegenliquidität oder ineffizientem Bereich, Teilverkäufe staffeln.', invalidation: 'Keine Reclaim-Struktur nach dem Sweep oder direktes Weiterlaufen.', mistakes: ['Jeden Sweep handeln', 'Kein HTF-Bias', 'Entry ohne Confirmation'], bestMarket: 'NASDAQ', bestSession: 'New York Open', performance: '+4,240 € · 68% Winrate · +1.24R', coverImage: getSetupImagePath('liquidity-sweep-1.png'), exampleImages: [getSetupImagePath('liquidity-sweep-1.png'), getSetupImagePath('liquidity-sweep-2.png')] },
  'Order Block Retest': { category: 'SMC', entry: 'Rücklauf in einen validen Order Block mit klarer Reaktion auf LTF.', exit: 'Teilgewinn am ersten Liquiditätspool, Rest an HTF-Ziel.', invalidation: 'Tiefe Akzeptanz durch den Block ohne Reclaim.', mistakes: ['Zu frühes Front-Running', 'Order Block ohne Kontext handeln', 'SL in offensichtliche Sweep-Zone legen'], bestMarket: 'DAX', bestSession: 'London', performance: '+2,980 € · 63% Winrate · +0.91R', coverImage: getSetupImagePath('order-block-retest-1.png'), exampleImages: [getSetupImagePath('order-block-retest-1.png')] },
  'Fair Value Gap Fill': { category: 'SMC', entry: 'Reaktion in ineffizienter Zone mit Trend- oder Reversal-Bestätigung.', exit: 'Nächstes Strukturlevel oder Liquiditätshoch/-tief.', invalidation: 'Komplette FVG-Akzeptanz ohne Reaktionssignal.', mistakes: ['FVG ohne Kontext', 'Zu kleine Targets', 'Kein Session-Fokus'], bestMarket: 'EUR/USD', bestSession: 'London', performance: '+1,860 € · 59% Winrate · +0.63R', coverImage: getSetupImagePath('fair-value-gap-fill-1.png'), exampleImages: [getSetupImagePath('fair-value-gap-fill-1.png')] },
  'Breakout Pullback': { category: 'Price Action', entry: 'Breakout aus Range oder Struktur, dann Rücklauf an Ausbruchsebene.', exit: 'Measured Move oder nächster markanter Widerstand.', invalidation: 'Schnelles Zurückfallen in die Range mit Akzeptanz.', mistakes: ['Breakout im Chop', 'Zu späte Entries', 'Kein Volumenfilter'], bestMarket: 'GBP/USD', bestSession: 'London', performance: '-620 € · 41% Winrate · -0.18R', coverImage: getSetupImagePath('breakout-pullback-1.png'), exampleImages: [getSetupImagePath('breakout-pullback-1.png')] },
  'Opening Range Expansion': { category: 'Momentum', entry: 'Impulsiver Ausbruch aus der Opening Range mit Volumen und Follow-through.', exit: 'Trail nach Momentum-Schüben oder Exit an Erschöpfung.', invalidation: 'Kein Halten oberhalb/unterhalb der Opening Range.', mistakes: ['Zu große Positionsgröße', 'Später Chase-Entry', 'News falsch eingeschätzt'], bestMarket: 'BTC/USD', bestSession: 'New York', performance: '+2,440 € · 64% Winrate · +1.08R' },
  'VWAP Reclaim': { category: 'Mean Reversion', entry: 'Rückkehr an VWAP nach Überdehnung mit Stabilisierung und Trigger.', exit: 'Mean Return oder Gegenstruktur.', invalidation: 'Weiteres Wegdriften ohne Reclaim-Akzeptanz.', mistakes: ['Gegen starken Trend kämpfen', 'Zu enger Stop', 'News-Reversion handeln'], bestMarket: 'NASDAQ', bestSession: 'New York', performance: '+1,340 € · 57% Winrate · +0.46R' },
}

export const trades: Trade[] = [
  { id: '14 Mär 2026-NASDAQ', date: '14 Mär 2026', market: 'NASDAQ', setup: 'Liquidity Sweep', result: '+420 €', r: '+1.8R', emotion: 'Fokussiert', quality: 'A-Setup', session: 'New York Open', concept: 'SMC' },
  { id: '13 Mär 2026-EUR/USD', date: '13 Mär 2026', market: 'EUR/USD', setup: 'Breakout Pullback', result: '-120 €', r: '-0.6R', emotion: 'Unsicher', quality: 'B-Setup', session: 'London', concept: 'Price Action' },
  { id: '12 Mär 2026-DAX', date: '12 Mär 2026', market: 'DAX', setup: 'Order Block Retest', result: '+310 €', r: '+1.1R', emotion: 'Ruhig', quality: 'A-Setup', session: 'London', concept: 'SMC' },
  { id: '11 Mär 2026-BTC/USD', date: '11 Mär 2026', market: 'BTC/USD', setup: 'Opening Range Expansion', result: '+860 €', r: '+2.4R', emotion: 'Diszipliniert', quality: 'A-Setup', session: 'New York', concept: 'Momentum' },
]

export const tradeDetails: Record<string, TradeDetail> = {
  '14 Mär 2026-NASDAQ': { title: 'NASDAQ Liquidity Sweep', date: '14 Mär 2026 · New York Open', result: '+1.8R', pnl: '+420 €', emotion: 'Fokussiert', setup: 'Liquidity Sweep', quality: 'A-Setup', ruleCheck: 'Regelkonform', lesson: 'Bestätigung abgewartet, Entry sauber, Exit diszipliniert vor Widerstand.', screenshotUrl: getTradeScreenshotPath('demo-trade-1.png') },
  '13 Mär 2026-EUR/USD': { title: 'EUR/USD Breakout Pullback', date: '13 Mär 2026 · London', result: '-0.6R', pnl: '-120 €', emotion: 'Unsicher', setup: 'Breakout Pullback', quality: 'B-Setup', ruleCheck: 'Zu früher Entry', lesson: 'Breakout war im Chop zu nah am Mittelbereich. Besser Session-Kontext abwarten.', screenshotUrl: getTradeScreenshotPath('demo-trade-2.png') },
}

export const tradeTags = [
  { id: 'tag-1', trade_id: '14 Mär 2026-NASDAQ', tag: 'Regelkonform', created_at: '2026-03-14T11:20:00.000Z' },
  { id: 'tag-2', trade_id: '14 Mär 2026-NASDAQ', tag: 'Geduldig', created_at: '2026-03-14T11:21:00.000Z' },
  { id: 'tag-3', trade_id: '13 Mär 2026-EUR/USD', tag: 'Zu früh', created_at: '2026-03-13T10:10:00.000Z' },
  { id: 'tag-4', trade_id: '13 Mär 2026-EUR/USD', tag: 'FOMO', created_at: '2026-03-13T10:11:00.000Z' },
  { id: 'tag-5', trade_id: '12 Mär 2026-DAX', tag: 'A-Setup', created_at: '2026-03-12T09:15:00.000Z' },
  { id: 'tag-6', trade_id: '12 Mär 2026-DAX', tag: 'Diszipliniert', created_at: '2026-03-12T09:16:00.000Z' },
  { id: 'tag-7', trade_id: '11 Mär 2026-BTC/USD', tag: 'News', created_at: '2026-03-11T14:40:00.000Z' },
  { id: 'tag-8', trade_id: '11 Mär 2026-BTC/USD', tag: 'Momentum', created_at: '2026-03-11T14:41:00.000Z' },
]

export const dailyNotes: DailyNoteRow[] = [
  {
    id: 'daily-note-1',
    user_id: 'demo-user',
    trade_date: '2026-03-14',
    title: 'Sauberer NY-Open-Tag',
    note: 'Geduldig auf den Sweep gewartet, nicht gechased und den Exit vor Widerstand genommen. Genau so soll der Prozess aussehen.',
    mood: 'Kontrolliert',
    focus: 'Geduld > Aktivität',
    created_at: '2026-03-14T18:00:00.000Z',
  },
  {
    id: 'daily-note-2',
    user_id: 'demo-user',
    trade_date: '2026-03-13',
    title: 'Zu schnell im Chop',
    note: 'Breakout ohne genug Raum gehandelt. Vor dem Entry fehlte die klare Bestätigung. Nächstes Mal Struktur und Session-Kontext höher gewichten.',
    mood: 'Angespannt',
    focus: 'Confirmation vor Entry',
    created_at: '2026-03-13T18:05:00.000Z',
  },
]
