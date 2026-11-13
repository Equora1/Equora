import type { JournalLocale } from '@/lib/i18n/journal'
import type { CsvImportFieldKey, CsvImportPresetKey } from '@/lib/utils/trade-import'

const englishFields: Record<CsvImportFieldKey, string> = {
  date: 'Date and time',
  market: 'Market / symbol',
  currency: 'Account currency',
  netPnL: 'P&L',
  entry: 'Entry',
  exit: 'Exit',
  stopLoss: 'Stop loss',
  takeProfit: 'Take profit',
  direction: 'Direction',
  setup: 'Setup',
  session: 'Session',
  tags: 'Tags',
  notes: 'Notes',
  fees: 'Fees',
  positionSize: 'Position size',
  instrumentType: 'Instrument type',
  leverage: 'Leverage',
}

export function importFieldLabel(key: CsvImportFieldKey, original: string, locale: JournalLocale) {
  return locale === 'en' ? englishFields[key] : original
}

const englishPresets: Record<CsvImportPresetKey, { label?: string; description: string }> = {
  generic: { label: 'Generic CSV', description: 'For files from other brokers, exchanges or spreadsheets.' },
  'metatrader4-history': { label: 'MetaTrader 4 report', description: 'For MetaTrader 4 account history exported as an HTML report.' },
  'ctrader-history': { description: 'For account history statements exported from cTrader.' },
  'mexc-futures': { description: 'For MEXC Futures and perpetual futures exports.' },
  'mexc-spot': { description: 'For MEXC Spot trade history.' },
  'binance-futures': { description: 'For Binance Futures and USD-M exports.' },
  'bybit-futures': { description: 'For Bybit perpetual futures exports.' },
  'okx-futures': { description: 'For OKX Futures and swap exports.' },
  'kraken-spot': { description: 'For Kraken ledger and spot trade exports.' },
}

export function importPresetCopy(
  preset: { key: CsvImportPresetKey; label: string; badge: string; description: string },
  locale: JournalLocale,
) {
  if (locale === 'de') return preset
  const english = englishPresets[preset.key]
  const badge = preset.badge === 'Frei' ? 'General' : preset.badge === 'Krypto' ? 'Crypto' : preset.badge === 'Plattform' ? 'Platform' : preset.badge
  return { ...preset, ...english, label: english.label ?? preset.label, badge }
}

// These messages are stored with import evidence. Translate only when displaying them.
const englishDiagnostics = new Map([
  ['Hohes Vertrauen', 'High confidence'],
  ['Solide prüfen', 'Looks plausible'],
  ['Nur mit Prüfung', 'Review needed'],
  ['Niedriges Vertrauen', 'Low confidence'],
  ['Kein belastbares Ergebnis: P&L oder Entry/Exit fehlen.', 'No reliable result. Add P&L or the entry and exit prices.'],
  ['R bleibt offen: Stop oder initiales Risiko fehlt.', 'R is unavailable because the stop or initial risk is missing.'],
  ['P&L wurde aus der Datei übernommen. Gebühren nur prüfen, wenn die Börse sie getrennt ausweist.', 'P&L came from the file. Check fees if the exchange reports them separately.'],
  ['cTrader Net enthält Kosten bereits. Die Kommission wird für Equora als positiver Kostenbetrag dokumentiert, aber nicht erneut vom importierten Netto-P&L abgezogen.', 'cTrader net P&L already includes costs. Equora records the commission separately as a cost.'],
  ['MT4 Net P&L enthält Commission, Taxes und Swap bereits. Die Kommission wird als positiver Kostenbetrag dokumentiert, aber nicht erneut vom importierten Netto-P&L abgezogen.', 'MT4 net P&L already includes commission, taxes and swap. Equora records the commission separately as a cost.'],
  ['P&L wurde nicht geliefert. Equora kann nur mit vollständigem Preis- und Size-Kontext sinnvoll rechnen.', 'The file has no P&L. Calculating it requires all relevant prices and the position size.'],
  ['Setup kommt vom Preset. Später mit deinem echten Setup verknüpfen.', 'The preset supplied the setup. You can link your own setup later.'],
  ['Spot-Export liefert oft Ausführungen statt fertige Trades. Ergebnis später ergänzen.', 'Spot exports often list individual fills. Add the trade result later.'],
  ['Explizite MEXC-Eröffnungszeile. Sie wird ohne belastbare Positions-ID und Teilfill-Zuordnung nicht automatisch gepaart.', 'This MEXC row opens a position. Matching it requires a position ID and reliable fill information.'],
  ['MEXC-Zeile ohne eindeutige Open-/Close-Aktion. Manuelle Prüfung erforderlich; keine heuristische Paarung.', 'Review this MEXC row manually. It does not clearly open or close a position.'],
  ['MEXC-Schließungszeile ohne lesbares Closing P&L. Manuelle Prüfung erforderlich.', 'Review this MEXC closing row manually. Its closing P&L is missing or unreadable.'],
  ['Exportzeit enthält keine belastbare Zeitzone. Bitte den UTC-Offset des Exports ausdrücklich wählen.', 'The timestamp has no reliable time zone. Enter the UTC offset used in the export.'],
  ['Datum fehlt oder ist nicht lesbar.', 'The date is missing or unreadable.'],
  ['Markt / Symbol fehlt.', 'The market or symbol is missing.'],
  ['Kontowährung ist nicht unterstützt; erlaubt sind EUR, USD, GBP, USDT und USDC.', 'Unsupported account currency. Choose EUR, USD, GBP, USDT or USDC.'],
  ['Basisdaten vorhanden, aber ohne P&L oder Preiskontext.', 'Basic details are present. P&L or the relevant prices are missing.'],
  ['MEXC Futures erkannt, aber ohne P&L oder Preiswerte ist die Zeile nur halb lesbar.', 'This MEXC Futures row is incomplete because P&L and prices are missing.'],
  ['CSV enthält ein nicht geschlossenes Anführungszeichen.', 'The CSV file contains an unclosed quote.'],
  ['CSV ist zu groß. Erlaubt sind höchstens 5 MB Text.', 'The CSV file exceeds the 5 MB text limit.'],
  ['Datei enthält eine zu breite Zeile oder eine überlange Zelle und wurde nicht verarbeitet.', 'A row has too many columns or a cell is too long. The file could not be read.'],
  ['MT4-Bericht enthält eine überlange Zelle und wurde nicht verarbeitet.', 'An MT4 report cell is too long. The file could not be read.'],
  ['MT4-Bericht enthält zu viele Spalten und wurde nicht verarbeitet.', 'The MT4 report has too many columns. The file could not be read.'],
  ['Die MT4-Kontohistorie muss genau eine Price-Spalte vor und genau eine Price-Spalte nach Close Time enthalten.', 'The MT4 history must have one Price column before Close Time and one after it.'],
  ['MT4-Bericht ist zu groß. Erlaubt sind höchstens 5 MB Text.', 'The MT4 report exceeds the 5 MB text limit.'],
  ['Dieser Bericht weist auf MetaTrader 5 hin. MT5-Orders, Deals und Positionen dürfen nicht als MT4-Historie interpretiert werden.', 'This appears to be a MetaTrader 5 report. Choose an MT4 account history report for this preset.'],
  ['Kein lesbarer MetaTrader-4-HTML-Bericht gefunden. Bitte in MT4 unter Kontohistorie als Bericht speichern.', 'Choose a readable HTML report saved from Account History in MetaTrader 4.'],
  ['Der Bericht weist sich nicht eindeutig als MetaTrader-4-Export aus. Akzeptiert werden ein expliziter MT4-Hinweis oder die Standardkombination aus Statement-Titel und Closed Transactions.', 'The file could not be identified as an MT4 export. Choose a standard MT4 account history report.'],
  ['Die erwartete MT4-Kontohistorie mit Ticket, Open/Close Time, zwei Price-Spalten sowie Commission, Taxes, Swap und Profit fehlt.', 'The report is missing the columns required for MT4 account history.'],
  ['Die MT4-Berichtsspalten konnten nicht eindeutig gebunden werden.', 'The MT4 report columns could not be matched to trade fields.'],
  ['Der MT4-Bericht enthält keine eindeutig geschlossenen Buy-/Sell-Trades. Offene Trades, Pending Orders und Kontobuchungen werden nicht übernommen.', 'The MT4 report contains no identifiable closed buy or sell trades.'],
])

export function importDiagnostic(message: string, locale: JournalLocale) {
  if (locale === 'de') return message
  const translated = englishDiagnostics.get(message)
  if (translated) return translated

  const reusedColumn = /^Spalte „(.+)“ ist mehreren Feldern zugeordnet\./.exec(message)
  if (reusedColumn) return `Column “${reusedColumn[1]}” is mapped to several fields. Use each column once.`
  const ambiguousColumn = /^Spalte „(.+)“ passt gleich stark zu mehreren Feldern\./.exec(message)
  if (ambiguousColumn) return `Column “${ambiguousColumn[1]}” matches several fields. Choose one field for it.`
  const tooMany = /^Datei hat zu viele (Spalten|Datenzeilen)\. Erlaubt sind höchstens (\d+)\.$/.exec(message)
  if (tooMany) return `The file exceeds the limit of ${tooMany[2]} ${tooMany[1] === 'Spalten' ? 'columns' : 'data rows'}.`
  const wideRow = /^Datenzeile (\d+) enthält mehr Zellen als die Kopfzeile/.exec(message)
  if (wideRow) return `Data row ${wideRow[1]} has more cells than the header row.`
  const mt4Limit = /^MT4-Bericht überschreitet das sichere Limit von (\d+) (?:geschlossenen )?Trades\.$/.exec(message)
  if (mt4Limit) return `The MT4 report exceeds the limit of ${mt4Limit[1]} trades.`
  const mt4Incomplete = /^MT4-Berichtszeile (\d+) ist strukturell unvollständig\./.exec(message)
  if (mt4Incomplete) return `MT4 report row ${mt4Incomplete[1]} is incomplete. The report could not be read safely.`
  return message
}
