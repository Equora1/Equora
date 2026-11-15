import Link from 'next/link'
import { journalNumberLocale, journalText, type JournalLocale } from '@/lib/i18n/journal'
import { getBrokerFileImportCopy } from '@/lib/i18n/broker-file'
import { DEFAULT_TRADE_TIMEZONE } from '@/lib/utils/trade-time'
import { AppIcon, type AppIconName } from '@/components/ui/app-icon'
import { FuturisticCard } from '@/components/ui/futuristic-card'
import { BrokerConnectionPanel } from '@/components/broker-sync/broker-connection-panel'
import { BrokerOnboardingCatalog } from '@/components/broker-sync/broker-onboarding-catalog'
import type { BrokerSyncSnapshot } from '@/lib/server/broker-sync'
import type { BrokerCaptureRunSummary, BrokerPreviewItem } from '@/lib/types/broker-sync'
import { brokerCatalogSummary } from '@/lib/utils/broker-catalog'
import { brokerFileImportCapability } from '@/lib/utils/broker-file-import-capability'

export function BrokerSyncHub({ snapshot, locale = 'de' }: { snapshot: BrokerSyncSnapshot; locale?: JournalLocale }) {
  const text = journalText(locale)
  const importCopy = getBrokerFileImportCopy(locale)
  const workflow = [
    [text('Brokerstatus prüfen', 'Check broker availability'), text('Zugangsdaten werden nur bei freigeschalteten Verbindungen abgefragt.', 'Credentials are requested only for enabled connections.')],
    [text('Lesezugriff prüfen', 'Check read access'), text('Equora prüft festgelegte Lesezugriffe.', 'Equora checks specific read permissions.')],
    [text('Daten ansehen', 'Preview the data'), text('Orders und Ausführungen erscheinen zuerst in der Vorschau.', 'Orders and fills appear in a preview first.')],
  ]

  const fullSnapshotAvailable = snapshot.readScope === 'full_snapshot'
  const userAttestedReadOnlyConnection = snapshot.connections.some((connection) =>
    connection.status === 'ready'
      && connection.readOnlyAttestation === 'user_confirmed',
  )
  const limitedTechnicalReadObserved = snapshot.connections.some((connection) =>
    connection.technicalReadResult === 'legacy_read_observed',
  )
  return (
    <div lang={locale} className="space-y-5 xl:space-y-6">
      <FuturisticCard glow="orange" className="p-6 sm:p-7">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl border border-[#c8823a]/25 bg-[#c8823a]/10 p-3 text-[#f0a855]">
                <AppIcon name="sync" className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>

                <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">{text("Broker verbinden", "Connect a broker")}</h1>
              </div>
            </div>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/58 sm:text-base">
              {text("Prüfe verfügbare Verbindungen und Wege zur Dateiübernahme. Gefundene Brokerdaten erscheinen zunächst als Vorschau; Equora handelt nicht für dich und übernimmt keine Trades automatisch.", "Find your broker or preview a file. Broker data appears in a preview first. Equora never places trades or imports them automatically.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill
              label={snapshot.runtimeEnabled ? text("Brokerabruf freigeschaltet", "Broker data access enabled") : text("Brokerabruf deaktiviert", "Broker data access off")}
              tone={snapshot.runtimeEnabled ? 'quiet' : 'warning'}
            />
            {userAttestedReadOnlyConnection ? (
              <StatusPill label={text("Nutzer bestätigt: Read-only-Key", "Read-only access confirmed by you")} tone="quiet" />
            ) : null}
          </div>
        </div>
      </FuturisticCard>

      {snapshot.notice ? (
        <div className="rounded-2xl border border-[#c8823a]/20 bg-[#c8823a]/8 px-4 py-3 text-sm leading-6 text-[#dfc6a7]">
          {snapshot.notice}
        </div>
      ) : null}

      <FuturisticCard className="overflow-hidden p-0">
        <div className="border-b border-white/8 px-6 py-6 sm:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">

              <h3 className="mt-2 text-2xl font-semibold text-white">{text("Der schnellste passende Weg zu deinen Trades", "Ways to bring in your trades")}</h3>
              <p className="mt-3 text-sm leading-6 text-white/58">
                {text("Suche deinen Broker oder deine Handelsplattform. Du siehst, ob eine Dateivorschau vorbereitet ist oder eine direkte Verbindung erst geplant wird.", "Search for your broker or platform to see which options are available.")}
              </p>
            </div>
            <span className="w-fit rounded-full border border-[#c8823a]/25 bg-[#c8823a]/10 px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] text-[#f0a855]">
              {text(`${brokerCatalogSummary.brokerCount} Broker · ${brokerCatalogSummary.platformCount} Plattformen`, `${brokerCatalogSummary.brokerCount} brokers · ${brokerCatalogSummary.platformCount} platforms`)}
            </span>
          </div>
        </div>

        <div className="grid lg:grid-cols-3">
          <OnboardingLane

            icon="vault"
            eyebrow={text(brokerFileImportCapability.statusLabel, 'File preview')}
            title={text("Dateiimport vorbereiten", "Preview a file")}
            description={text('CSV- und Excel-Dateien lassen sich prüfen.', 'Preview CSV and Excel files.')}
            metric={text(`${brokerCatalogSummary.builtFileProfileCount} Dateivorlagen`, `${brokerCatalogSummary.builtFileProfileCount} file templates`)}
            inactiveLabel={importCopy.blocked}
            tone="controlled"
          />
          <OnboardingLane

            icon="sync"
            eyebrow={text("Kontrollierter Ausbau", "Direct connection")}
            title={text("Verbindung zum Lesen von Daten", "Read broker data")}
            description={text("Verbindungen sind nur für unterstützte Broker möglich. Ein Verbindungscheck und die spätere Datenübernahme sind getrennte Schritte.", "Check access for a supported broker before retrieving data.")}
            metric={snapshot.runtimeEnabled
              ? text('OKX noch nicht verfügbar', 'OKX connection unavailable')
              : text('MEXC-Abruf aus · OKX noch nicht verfügbar', 'MEXC data access off · OKX unavailable')}
            href="#broker-connections"
            action={text("Verbindungen prüfen", "Check connections")}
            tone="controlled"
          />
          <OnboardingLane

            icon="scan"
            eyebrow={text("Weitere Handelsplattformen", "Other trading platforms")}
            title={text("Plattformfamilie nutzen", "Use a platform export")}
            description={text('Dateivorlagen für cTrader und MetaTrader 4 sind vorbereitet. Direkte Verbindungen zu MetaTrader 5 und DXtrade sind noch nicht verfügbar.', 'File templates are ready for cTrader and MetaTrader 4. Direct connections to MetaTrader 5 and DXtrade are still unavailable.')}
            metric={text("cTrader und MT4: Dateivorlagen vorbereitet · Direkter Abruf aus", "File templates for cTrader and MT4")}
            inactiveLabel={importCopy.blocked}
            tone="controlled"
          />
        </div>
      </FuturisticCard>

      <BrokerOnboardingCatalog locale={locale} />

      <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <FuturisticCard className="p-6">
          <SectionHeading eyebrow={text("Berechtigungen", "Permissions")} title={text("Was Equora lesen darf", "What Equora can read")} />
          <div className="mt-5 grid gap-3">
            <PermissionCard
              title={text("Equora-Lesefunktion", "Read access")}
              description={text("Equora verwendet festgelegte Leseabrufe. Jeder Abruf benötigt eine freigeschaltete Verbindung und deine Zustimmung.", "Each data request needs an enabled connection and your consent.")}
              state={limitedTechnicalReadObserved ? text("Begrenzter Leseabruf beobachtet", "Limited read access observed") : text("Nicht technisch beobachtet", "No read access observed")}
            />
            <PermissionCard
              title={text("Trading in Equora", "Trading in Equora")}
              description={text("Equora implementiert keine Funktion zum Öffnen, Ändern oder Schließen von Orders.", "Equora cannot open, change or close orders.")}
              state={text("In der App nicht implementiert", "Unavailable in Equora")}
            />
            <PermissionCard
              title={text("Schreibrechte beim Broker", "Broker write permissions")}
              description={text("Deine Bestätigung allein zeigt nicht, welche Schreibrechte der Broker tatsächlich erlaubt.", "Broker permissions must be checked separately from your confirmation.")}
              state={userAttestedReadOnlyConnection
                ? text("Von dir als deaktiviert bestätigt; technisch nicht vollständig geprüft", "You confirmed they are off. Verification is incomplete.")
                : text("Nicht vollständig technisch verifiziert", "Full permissions unverified")}
            />
          </div>
          <p className="mt-5 rounded-2xl border border-white/8 bg-white/[0.025] p-4 text-sm leading-6 text-white/60">
            {text("Zugangsschlüssel werden auf dem Server verschlüsselt gespeichert und danach nicht wieder im Browser angezeigt. Die Protokolle externer Broker und Plattformen sind damit nicht vollständig geprüft.", "Equora stores keys encrypted on the server and hides them after saving. External broker and platform protocols are only partially verified.")}
          </p>
        </FuturisticCard>

        <FuturisticCard className="p-6">
          <SectionHeading eyebrow={text("Bereitschaft", "Availability")} title={text("Was schon funktioniert", "What is available")} />
          <div className="mt-5 space-y-3">
            <ReadinessRow label={text("Verbindungsübersicht", "Connections")} value={schemaStateLabel(snapshot.schemaState, locale)} />
            <ReadinessRow
              label={text("Verschlüsselter Zugang", "Encrypted credential storage")}
              value={dependencyStateLabel(snapshot.secureStoreState, locale)}
            />
            <ReadinessRow
              label={text("Serverseitiger Verbindungscheck", "Connection check")}
              value={!snapshot.runtimeEnabled
                ? text("Brokerabruf deaktiviert", "Broker data access off")
                : snapshot.connectorState === 'ready'
                  ? text("Voraussetzungen vorhanden; Start prüft erneut", "Ready to check access")
                  : snapshot.connectorState === 'not_read'
                    ? text("Status nicht lesbar; Setupformular nicht verfügbar", "Status unavailable. Setup is disabled.")
                    : text("Abruf freigeschaltet; Einrichtung noch unvollständig", "Data access enabled. Finish setting up the connection.")}
            />
            <ReadinessRow label={text("Automatisch ins Journal übernehmen", "Automatic journal import")} value={text("Noch ausgeschaltet", "Off")} />
          </div>
        </FuturisticCard>
      </div>

      <div id="broker-connections" className="scroll-mt-6">
        <FuturisticCard className="p-5 sm:p-6">
          <BrokerConnectionPanel
            locale={locale}
            connections={snapshot.connections}
            schemaState={snapshot.schemaState}
            connectorState={snapshot.connectorState}
            secureStoreState={snapshot.secureStoreState}
          />
        </FuturisticCard>
      </div>

      <FuturisticCard className="p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading eyebrow={text("Datenvorschau", "Data preview")} title={text("Zuletzt bei Brokern gefunden", "Recent broker data")} />
          <span className="text-xs text-white/60">
            {fullSnapshotAvailable ? text(`${snapshot.preview.length} Einträge`, `${snapshot.preview.length} items`) : text("Vorschaudaten nicht geladen", "Preview unavailable")}
          </span>
        </div>
        <div className="mt-5">
          {fullSnapshotAvailable && snapshot.preview.length ? (
            <div className="overflow-hidden rounded-2xl border border-white/8">
              <div className="hidden grid-cols-[0.7fr_1fr_1fr_0.8fr_0.8fr_1fr] gap-3 border-b border-white/8 bg-white/[0.025] px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-white/60 md:grid">
                <span>{text("Art", "Type")}</span>
                <span>{text("Markt", "Market")}</span>
                <span>{text("Richtung", "Side")}</span>
                <span>{text("Preis", "Price")}</span>
                <span>{text("Ergebnis", "Result")}</span>
                <span>{text("Zeit", "Time")}</span>
              </div>
              <div className="divide-y divide-white/6">
                {snapshot.preview.map((item) => <PreviewRow key={item.id} item={item} locale={locale} />)}
              </div>
            </div>
          ) : !fullSnapshotAvailable ? (
            <div className="rounded-2xl border border-dashed border-white/12 px-6 py-9 text-center">
              <p className="text-sm font-medium text-white">{text("Die Datenvorschau ist derzeit nicht verfügbar.", "The preview is unavailable.")}</p>
              <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-white/60">
                {text("Die Verbindungsübersicht hat keinen Zugriff auf diese Details. Daraus folgt nicht, dass beim Broker keine Daten vorliegen.", "This view cannot show whether the broker has data.")}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/12 px-6 py-9 text-center">
              <p className="text-sm font-medium text-white">{text("Noch keine Datenvorschau vorhanden.", "No preview data yet.")}</p>
              <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-white/60">
                {text("Erst nach einem freigegebenen Datenabruf erscheinen hier Brokerdaten. Ein Verbindungscheck speichert keine Rohdaten. Daten in der Vorschau sind noch keine Trades in deinem Journal.", "An approved data retrieval can populate this preview. A connection check saves no raw data. Preview items are separate from journal trades.")}
              </p>
            </div>
          )}
        </div>
      </FuturisticCard>

      <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <FuturisticCard className="p-6">
          <SectionHeading eyebrow={text("Ablauf", "How it works")} title={text("Vom Broker zur kontrollierten Vorschau", "From broker to preview")} />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {workflow.map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-white/8 bg-white/[0.022] p-4">
                <p className="text-sm font-medium text-white">{title}</p>
                <p className="mt-2 text-xs leading-5 text-white/60">{description}</p>
              </div>
            ))}
          </div>
        </FuturisticCard>

        <FuturisticCard className="p-6">
          <SectionHeading eyebrow={text("Letzte Prüfungen", "Recent checks")} title={text("Was zuletzt passiert ist", "Data retrieval history")} />
          <div className="mt-5">
            {snapshot.recentRuns.length ? (
              <div className="space-y-3">
                {snapshot.recentRuns.map((run) => <RunCard key={run.id} run={run} locale={locale} />)}
              </div>
            ) : !fullSnapshotAvailable ? (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-sm leading-6 text-white/60">
                {text("Nachweise zu Datenabrufen sind in dieser Ansicht nicht verfügbar. Ob frühere Abrufe vorliegen, lässt sich hier nicht feststellen.", "Retrieval history is unavailable in this view.")}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-5 text-sm leading-6 text-white/60">
                {text("In den verfügbaren Nachweisen ist noch kein Datenabruf verzeichnet. Nach einem gesondert freigegebenen Abruf erscheint hier, wie viele Datensätze beobachtet und wie viele bereits bekannt waren.", "No data retrievals are recorded in the available history. After an approved retrieval, you can see how many records were new and how many were already known.")}
              </div>
            )}
          </div>
        </FuturisticCard>
      </div>
    </div>
  )
}

function OnboardingLane({
  icon,
  eyebrow,
  title,
  description,
  metric,
  href,
  action,
  inactiveLabel,
  tone,
}: {
  icon: AppIconName
  eyebrow: string
  title: string
  description: string
  metric: string
  href?: string
  action?: string
  inactiveLabel?: string
  tone: 'ready' | 'controlled' | 'planned'
}) {
  const accentClass = tone === 'ready'
    ? 'border-emerald-300/25 bg-emerald-300/10 text-emerald-200'
    : tone === 'controlled'
      ? 'border-[#c8823a]/25 bg-[#c8823a]/10 text-[#f0a855]'
      : 'border-white/10 bg-white/[0.035] text-white/55'

  return (
    <article className="relative border-b border-white/8 p-6 last:border-b-0 lg:border-b-0 lg:border-r lg:last:border-r-0">
      <div className="flex items-start justify-between gap-4">
        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl border ${accentClass}`}>
          <AppIcon name={icon} className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-6 text-[10px] uppercase tracking-[0.16em] text-[#b09a7a]">{eyebrow}</p>
      <h4 className="mt-2 text-lg font-semibold text-white">{title}</h4>
      <p className="mt-3 min-h-24 text-sm leading-6 text-white/55">{description}</p>
      <div className="mt-5 border-t border-white/8 pt-4">
        <p className="text-xs text-white/45">{metric}</p>
        {href && action ? (
          <Link
            href={href}
            className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3.5 py-2 text-xs font-medium text-white/72 transition hover:border-[#c8823a]/35 hover:bg-[#c8823a]/10 hover:text-white"
          >
            {action}
            <AppIcon name="arrow" className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : inactiveLabel ? (
          <span className="mt-4 inline-flex rounded-full border border-white/8 bg-black/20 px-3.5 py-2 text-[10px] uppercase tracking-[0.14em] text-white/35">
            {inactiveLabel}
          </span>
        ) : null}
      </div>
    </article>
  )
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="eq-display text-[0.58rem] text-[#b09a7a]">{eyebrow}</p>
      <h3 className="mt-2 text-xl font-semibold text-white">{title}</h3>
    </div>
  )
}

function StatusPill({ label, tone }: { label: string; tone: 'gold' | 'quiet' | 'warning' }) {
  const className = tone === 'gold'
    ? 'border-[#c8823a]/30 bg-[#c8823a]/10 text-[#f0a855]'
    : tone === 'warning'
      ? 'border-[#e5484d]/25 bg-[#e5484d]/10 text-[#ff9c9f]'
      : 'border-white/10 bg-white/[0.03] text-white/55'
  return <span className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.16em] ${className}`}>{label}</span>
}

function PermissionCard({ title, description, state }: { title: string; description: string; state: string }) {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.022] p-4">
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm font-medium text-white">{title}</p>
        <span className="text-left text-[10px] uppercase tracking-[0.14em] text-white/60">{state}</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/60">{description}</p>
    </div>
  )
}

function ReadinessRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3">
      <span className="text-sm text-white/55">{label}</span>
      <span className="text-xs font-medium text-white/82">{value}</span>
    </div>
  )
}

function schemaStateLabel(state: BrokerSyncSnapshot['schemaState'], locale: JournalLocale) {
  const text = journalText(locale)
  if (state === 'ready') return text("Lesbar", "Available")
  if (state === 'missing') return text("Einrichtung nicht verfügbar", "Setup unavailable")
  return text("Status nicht lesbar", "Status unavailable")
}

function dependencyStateLabel(state: BrokerSyncSnapshot['secureStoreState'], locale: JournalLocale) {
  const text = journalText(locale)
  if (state === 'ready') return text("Bereit", "Ready")
  if (state === 'not_ready') return text("Nicht verfügbar", "Unavailable")
  return text("Status nicht lesbar; Setupformular nicht verfügbar", "Status unavailable. Setup is disabled.")
}

function PreviewRow({ item, locale }: { item: BrokerPreviewItem; locale: JournalLocale }) {
  const text = journalText(locale)
  const directions: Readonly<Record<string, string>> = {
    'Long eröffnet': 'Opened long',
    'Short geschlossen': 'Closed short',
    'Short eröffnet': 'Opened short',
    'Long geschlossen': 'Closed long',
    'Richtung offen': 'Side unknown',
  }
  return (
    <div className="grid gap-3 px-4 py-4 text-xs md:grid-cols-[0.7fr_1fr_1fr_0.8fr_0.8fr_1fr] md:items-center">
      <span className="w-fit rounded-full border border-white/9 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.12em] text-white/60">
        {item.kind === 'execution' ? text("Ausführung", "Fill") : text("Order", "Order")}
      </span>
      <div>
        <span className="text-white/60 md:hidden">{text("Markt · ", "Market · ")}</span>
        <span className="font-medium text-white/78">{item.symbol}</span>
      </div>
      <div>
        <span className="text-white/60 md:hidden">{text("Richtung · ", "Side · ")}</span>
        <span className="text-white/58">{locale === 'en' ? (directions[item.direction] ?? item.direction) : item.direction}</span>
      </div>
      <div>
        <span className="text-white/60 md:hidden">{text("Preis · ", "Price · ")}</span>
        <span className="text-white/58">{formatNumber(item.price, locale)}</span>
      </div>
      <div>
        <span className="text-white/60 md:hidden">{text("Ergebnis · ", "Result · ")}</span>
        <span className="text-white/58">{formatNumber(item.profit, locale, true)}</span>
      </div>
      <div>
        <span className="text-white/60 md:hidden">{text("Zeit · ", "Time · ")}</span>
        <span className="text-white/60">{formatDate(item.occurredAt, locale)}</span>
      </div>
    </div>
  )
}

function RunCard({ run, locale }: { run: BrokerCaptureRunSummary; locale: JournalLocale }) {
  const text = journalText(locale)
  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-white">{runStatus(run.status, locale)}</span>
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/60">{formatDate(run.created_at, locale)}</span>
      </div>
      <p className="mt-3 text-xs leading-5 text-white/60">
        {text(
          `Beobachtet ${run.observed_event_count} · Neu gespeichert ${run.inserted_raw_event_count} · Wiederholt ${run.repeated_observation_count} · Fehler ${run.failed_request_count}`,
          `Observed ${run.observed_event_count} · Newly saved ${run.inserted_raw_event_count} · Repeated ${run.repeated_observation_count} · Errors ${run.failed_request_count}`,
        )}
      </p>
    </div>
  )
}

function runStatus(status: string, locale: JournalLocale) {
  const text = journalText(locale)
  const labels: Record<string, string> = {
    pending: text("Wartet", "Pending"),
    running: text("Wird geprüft", "Checking"),
    completed: text("Erfassung abgeschlossen", "Retrieval complete"),
    partial: text("Teilweise gespeichert", "Partially saved"),
    failed: text("Prüfung fehlgeschlagen", "Check failed"),
    cancelled: text("Abgebrochen", "Cancelled"),
  }
  return labels[status] ?? text("Prüfung", "Check")
}

function formatNumber(value: number | null, locale: JournalLocale, signed = false) {
  if (value == null) return journalText(locale)('Offen', 'Unavailable')
  return new Intl.NumberFormat(journalNumberLocale[locale], {
    maximumFractionDigits: 8,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(value)
}

function formatDate(value: string | null | undefined, locale: JournalLocale) {
  if (!value || !Number.isFinite(Date.parse(value))) return journalText(locale)('Ohne Datum', 'No date')
  return new Intl.DateTimeFormat(journalNumberLocale[locale], {
    dateStyle: 'short', timeStyle: 'short', timeZone: DEFAULT_TRADE_TIMEZONE,
  }).format(new Date(value))
}
