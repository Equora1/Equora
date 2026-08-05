# Equora v57.61.0 – G0 Decision Set

## 0. Dokumentkontrolle

| Feld | Wert |
|---|---|
| Designstatus | `DESIGN_ACCEPTED v14 – A3/A4/A5/A6 PASS; G0 GO – DESIGN ONLY` |
| Implementierungsstatus | `NOT STARTED`; kein G0-Kriterium |
| Providerevidenzstatus | `PARTIAL/CONTRADICTED`; Support nennt jüngsten Monat als operative API-Reichweite, garantiert aber weder Retention noch Vollständigkeit |
| Gate G0 | `GO – DESIGN ONLY`; Implementierung bleibt Folgegates G1–G6 |
| Stand | 2026-08-05, Europe/Berlin |
| Scope | Providerneutraler Brokerimport-Kern; MEXC v57.61.0 als prospektiver Read-only API-Adapter ab Aktivierung; manueller MEXC-Excel-Backfill nur als separat zu verifizierende Dateicapability |
| Baseline | `15551c0a5fba367fd2e0e6283071bddaf7a329f2` |
| Arbeits-HEAD bei Erstellung | `392addfaf32b6eba9ba1e34cef6fe65ce1ab944a` |
| Owner | A1 – Orchestrator / Engineering Lead |
| Pflichtreviews | A2, A3, A4, A5; A6 bei UX, Claims und Löschfolgen |
| Wirksamkeit | Keine Entscheidung in diesem Dokument autorisiert Code, SQL, Live-Brokerzugriff, Push oder Deployment |

## 1. Zweck und Entscheidungsstandard

Dieses Dokument konkretisiert die vor Implementierung erforderlichen
Produkt-, Fach- und Architekturentscheidungen. Es erweitert den Scope nicht um
weitere Broker. Es schafft eine providerneutrale Kernarchitektur, damit spätere
Broker nicht durch Kopieren von MEXC-spezifischer Logik integriert werden.

Jede Entscheidung enthält genau einen Owner. Weitere Rollen sind Reviewer. Die
Statuswerte bedeuten:

- `ACCEPTED`: durch Nutzerentscheidung oder bereits verbindliche Übergabe
  bestätigt; Reviews können trotzdem technische Folgeauflagen erzeugen.
- `DESIGN_ACCEPTED`: vollständiger, reviewter G0-Vertrag; Implementierung und
  ausgeführte Testevidenz bleiben ihren Folgegates zugeordnet.
- `PROPOSED`: fachlich empfohlener Entwurf; noch keine finale Freigabe.
- `BLOCKED`: ohne zusätzliche Provider-, Rechts-, Betriebs- oder
  Nutzerentscheidung nicht abschließbar.
- `REJECTED`: bewusst verworfene Alternative.

Gate G0 bleibt rot, solange eine importkritische Entscheidung `PROPOSED` oder
`BLOCKED` ist oder ein Pflichtreview des Designvertrags fehlt. Fehlender Code,
SQL oder ausgeführter Fixture-/DB-Test allein verhindert `DESIGN_ACCEPTED`
nicht; er verhindert die jeweiligen Folgegates.

Für das v12-Delta gilt eine einzige verbindliche Routingmatrix:

| Gegenstand | Owner | Unabhängige Pflichtreviews / Sign-off |
|---|---|---|
| DEC-5761-009 und Providervertrag | A2 | A3, A4, A5 |
| DEC-5761-018 | A5 | A2, A3, A4 |
| Logical ERD und Operationsdesign | A2 | A3, A4, A5 |
| Read-only Threat Model | A4 | A2, A3, A6 |
| Product-/Approval- und Claimwirkung | A6 | A2, A3, A4, A5 |
| G0-Gesamtentscheidung | A1 | alle vorgenannten Reviews beziehungsweise Owner-Sign-offs |

Ein Owner-Sign-off wird nicht als unabhängiger Selbstreview gezählt. „Pending“
bezeichnet in allen Artefakten die jeweils noch fehlenden Reviews oder den noch
fehlenden Owner-Sign-off gemäß dieser Matrix.

## 2. Verbindliche Bestandsentscheidungen

Die Entscheidungen `DEC-5761-001` bis `DEC-5761-005` aus der Übergabe bleiben
unverändert verbindlich:

1. v57.60.1 bleibt unveränderte Produktionsbasis.
2. v57.61.0 wird isoliert im Feature-Worktree entwickelt.
3. Die read-only Vorschau bleibt vom Journalimport getrennt; der Import bleibt
   bis G0–G6 gesperrt.
4. Human Approval ist zwingend.
5. Kein Secret wird in den Worktree kopiert.

## 3. Neue Entscheidungen

### DEC-5761-006 – Providerneutraler Kern, versionierte Brokeradapter

| Feld | Wert |
|---|---|
| Status | `ACCEPTED` |
| Owner | A2 |
| Reviewer | A5, A4, A3; A6 für Providerclaims |
| Nutzerentscheidung | Am 2026-08-04 bestätigt, dass später weitere Broker eingebunden werden sollen |

**Entscheidung**

Der Importkern modelliert Brokerkonto, Sync, Raw Event, Normalisierung,
Reconciliation, Kandidatenrevision, Approval, Import und Provenienz
providerneutral. Jeder Broker wird über einen versionierten Adapter mit eigenem
Providervertrag, Capability-Profil, Feldmapping, Fehlervertrag und Fixtures
angebunden.

v57.61.0 implementiert ausschließlich den MEXC-Futures-Adapter. Ein weiterer
Broker ist ein eigener Scope und durchläuft mindestens G0–G3 sowie die
betroffenen Security-, QA- und Releasegates erneut.

**Verworfene Alternative**

MEXC-Tabellen und MEXC-Feldnamen als generisches Domänenmodell zu verwenden.
Das würde spätere Integrationen an MEXC-Grains, Enums, Positionsmodi und
Pagination koppeln und technische Schulden vervielfachen.

**Akzeptanzkriterien**

- Der Kern kennt keine MEXC-Endpointpfade oder MEXC-Enums.
- Brokeradapter dürfen nur kanonische, typisierte Kernobjekte liefern.
- Unbekannte Providerfähigkeiten sind `unsupported` oder `unverified`, niemals
  implizit `supported`.
- Providervertrag und Adapterversion sind an Raw Events, Normalisierungen und
  Kandidatenrevisionen rückverfolgbar.

### DEC-5761-007 – Journal-Trade-Grain ist ein abgeschlossener Position Cycle

| Feld | Wert |
|---|---|
| Status | `DESIGN_ACCEPTED`; Provider-/Golden-Evidenz folgt G2/G3 |
| Owner | A5 |
| Reviewer | A2, A3; A6 für Darstellung |

**Entscheidungsvorschlag**

Ein Brokerimport erzeugt einen Journal-Trade aus einem fachlich abgeschlossenen
Position Cycle: von flat zu einer Position und zurück zu flat. Orders sind
Anweisungen und Kontext; Executions sind primäre Evidenz für ausgeführte Mengen
und Preise. Weder eine Order noch ein einzelner Fill ist automatisch ein
Journal-Trade.

Teilweise geschlossene, aber weiterhin offene Positionen werden als offene
Cycles dargestellt und sind nicht als abgeschlossene Journal-Trades
importierbar. Ihre Roh- und Reconciliation-Daten bleiben erhalten.

Ein Syncfenster, das erst innerhalb einer bereits offenen Position beginnt,
beweist keinen Cycle-Start. Ebenso beweist das Ende eines Abruffensters nicht,
dass eine Position geschlossen ist. Ein Cycle ist nur `boundary_complete`,
wenn der Zustand vor dem ersten Entry nachweislich flat war beziehungsweise
eine belastbare Provider-Position-ID den vollständigen Lifecycle abgrenzt und
der Zustand nach dem letzten Exit wieder flat ist. Andernfalls bleibt der
Kandidat `open` oder `blocked_boundary`.

**Begründung**

Dieses Grain verhindert die Doppelzählung von Order und Execution und passt zu
Teilfills, Teil-Exits, Funding und Reversals. Es ist brokerübergreifend
tragfähiger als orderbasierte Modelle.

**Akzeptanzkriterien**

- Ein Cycle besitzt eindeutige Menge- und Zeitgrenzen. Dabei sind mindestens
  `total_entry_contract_quantity`, `total_exit_contract_quantity`,
  `peak_open_contract_quantity` und `ending_open_contract_quantity`
  getrennte Größen; „Cycle-Menge“ ist kein mehrdeutiges Sammelfeld.
- Start- und Endgrenze sind durch Flat-Zustand oder eine gleichwertig belastbare
  Provider-Lifecycle-Evidenz belegt; ein Backfillbeginn innerhalb einer
  Position ist nicht importierbar.
- Für einen vollständigen Cycle summieren sich Entry-Open- und Exit-Close-
  Mengen exakt auf denselben Betrag, `ending_open_contract_quantity = 0`, und
  jede Executionmenge ist im relevanten Account-/Instrument-/Mode-/Side-Scope
  exakt einmal zugeordnet.
- Signed Inventory vor und nach jeder Allocation ist reproduzierbar. Ein
  mengenüberschießendes Reversal wird exakt in Close bis flat und Open der
  Gegenrichtung geteilt; beide Anteile ergeben zusammen die Executionmenge.
- Long-Inventar ist kanonisch positiv, Short-Inventar negativ; absolute
  Allocationmengen sind nichtnegativ und
  `inventory_after = inventory_before + signed_execution_delta`. Entry/Exit-
  Deltas sind je Long-/Short-Lane eindeutig; eine Allocation überschreitet
  null nie.
- Entry-/Exit-Value-Basis und Durchschnittspreis folgen der versionierten
  Contractformel. Eine generische mengengewichtete Preisformel ist kein
  zulässiger Default.
- Offene Restmengen bleiben sichtbar und nicht importierbar.
- Golden Tests decken Long, Short, Scale-in, Scale-out, erneutes Add nach
  Teil-Exit, Reversals und links- beziehungsweise rechtszensierte Syncfenster
  ab.

### DEC-5761-008 – Hedge Mode, One-way Mode und Reversals

| Feld | Wert |
|---|---|
| Status | `DESIGN_ACCEPTED`; Provider-/Golden-Evidenz folgt G1–G3 |
| Owner | A5 |
| Reviewer | A2, A3 |

**Entscheidungsvorschlag**

Ein Position Lifecycle wird mindestens durch Provider, Providerkonto,
Instrument, Positionsmodus und Positionsseite getrennt. Im Hedge Mode dürfen
Long und Short desselben Instruments gleichzeitig bestehen. Im One-way Mode
wird eine mengenüberschießende Gegenausführung in zwei Allocations zerlegt:

1. Schließender Anteil bis flat für den bestehenden Cycle.
2. Eröffnender Restanteil für einen neuen Cycle der Gegenrichtung.

Die Execution bleibt ein Raw-/Normalized-Objekt; die mengenanteilige Zuordnung
erfolgt über eine eigene Allocation-Relation. Es wird keine Execution kopiert.

**Fail-closed-Regel**

Fehlen belastbare Position-Mode-, Side- oder Mengeninformationen, bleibt der
Kandidat blockiert. Symbol und Richtung allein reichen nicht.

Mehrere Executions mit demselben Providerzeitwert bilden zunächst eine
Sequenzgruppe. Eine stabile ID darf diese Gruppe technisch paginieren, aber
nur bei belegter Provider-Sequenzsemantik wirtschaftlich ordnen. Führen
zulässige Permutationen zu verschiedenen Cycles, Reversals oder PnL-
Zuordnungen, ist das Ergebnis `ambiguous_sequence` und nicht `reviewable`.

Ohne Providersequenz wird keine faktorielle Permutation ausgeführt. Ein
versionierter Bounded Analyzer darf Reihenfolgeunabhängigkeit nur analytisch
belegen, wenn innerhalb einer Lane alle Deltas dasselbe Vorzeichen besitzen und
kein möglicher Nulldurchgang entsteht. Fehlender Beweis oder überschrittenes
Group-/CPU-/State-Budget blockiert unmittelbar; eine ID-Sortierung ist kein
Fallback.

### DEC-5761-009 – Prospektive Erfassung, Onboarding-Puffer und Recovery

| Feld | Wert |
|---|---|
| Status | `DESIGN_ACCEPTED – A2 OWNER PROMOTION 2026-08-05`; A3/A4/A5/A6-Gesamtrouting bis v14 PASS, Implementierungsevidenz folgt G1–G6 |
| Owner | A2 |
| Reviewer | A5, A3, A4; A6 Product-/Claim-Cross-Review |

**Nutzer- und Scopeentscheidung**

Der Hauptnutzen von v57.61.0 ist nicht ein behaupteter vollständiger
Mehrjahresbackfill, sondern die prospektive, regelmäßig wiederholte Erfassung
ab expliziter Aktivierung der Verbindung. Equora baut ab diesem Zeitpunkt sein
eigenes lokales Journal auf. Der Provider bleibt Datenquelle, aber nicht das
langfristige Archiv.

Die vom Nutzer am 2026-08-05 bestätigte Produktrichtung lautet:

- ungefähr ein Monat Providerhistorie dient ausschließlich als Onboarding- und
  Wiederanlaufpuffer;
- danach liest Equora neue Brokerereignisse regelmäßig und idempotent;
- Equora versucht ab erfolgreicher Aktivierung sichtbare Brokerereignisse
  regelmäßig zu erfassen und importfähige Kandidaten vorzubereiten; vom
  Provider nicht gelieferte, unvollständige oder blockierte Cycles können
  weiterhin manuelle Ergänzung oder – erst nach separatem File-Profile-GO –
  potenzielle Export-Recovery erfordern;
- ältere Historie und erkannte Lücken können nach einem separaten File-Profile-
  GO potenziell über den offiziellen Account Data Export ergänzt werden;
- MEXC Support bestätigt inzwischen `View Order Details` für die relevanten
  Futures-History-Endpoints und dass `Order Placing` nicht erforderlich ist;
  dies ergänzt die endpointbezogene öffentliche Dokumentation, beweist aber
  nicht die tatsächliche Gesamtrechtekonfiguration eines konkreten Keys.

**Verbindlicher prospektiver Sync-Vertrag**

1. Bei Aktivierung wird `activation_cutover_at` unveränderlich persistiert. Ein
   Onboardinglauf fragt höchstens die jüngsten 28 vollständigen UTC-Tage plus
   den laufenden Tag ab. `28 Tage` ist ein konservatives Equora-Abfrageprofil,
   keine MEXC-Retentions- oder Vollständigkeitsgarantie.
   `activation_cutover_at` ist die Absicht, nicht erfolgreiche Coverage.
   `first_successful_capture_at`, letzter erfolgreicher Pflichtscope,
   `activation_state` und ausschließlich abgeleitetes `capture_health` werden
   getrennt geführt; eine Lücke zwischen Cutover und erstem Erfolg bleibt
   sichtbar. Die erste Aktivierung erzeugt eine `activation_series_id`, eine
   Aktivierungszeile mit neuer ID/Generation `1` und einen atomaren Current-
   Pointer. Reaktivierung nach `inactive`/`revoked` oder Änderung gepinnter
   Identitäten/Versionen sperrt die Series, erzeugt eine neue Zeile mit neuer ID
   und nächster Generation, deaktiviert eine zuvor current/arbeitsfähige
   Vorgängerzeile und invalidiert deren Jobs/Leases im selben Commit. Ein
   `revoked`er Vorgänger bleibt `revoked`. Zwei parallele Wechsel werden per
   Series-Row-Lock/Version serialisiert. Nur ein Resume aus `paused` bei
   unveränderten Pins und weiterhin aktuellem Pointer darf dieselbe Zeile und
   Generation behalten; alte Gaps und Lane States bleiben bestehen.
2. Ein später aktivierter Scheduler darf ausschließlich read-only Syncs
   starten. Zielintervall sind sechs Stunden; beim nächsten Anwendungs-/Worker-
   start wird ein versäumter Lauf nachgeholt. Intervall und Aktivierung sind
   versionierte Betriebsparameter und keine stille Hintergrundfunktion.
   Fehlende oder widersprüchliche Permissionevidenz blockiert nicht das
   secretfreie G0-Architekturreview oder synthetische Fixtures. Jede konkrete
   MEXC-Sync-Aktivierung ist nur zulässig, wenn für jede Pflichtcapability
   des gepinnten Profils eine versionierte offizielle View-/Read-
   Permissionzuordnung vorliegt, die Nutzerattestierung aktuell ist und keine
   technisch erkennbare Broker-Schreibpermission besteht. Eine ungeklärte
   Pflichtcapability hält die Aktivierung in `blocked_permission_evidence`; ein
   erfolgreicher Lesetest ersetzt weder diese Zuordnung noch eine
   Gesamtrechteprüfung.
3. Vor dem Enqueue und erneut unmittelbar vor jedem Credential-Store-Zugriff
   prüft der Worker atomar Connection-/Account-/Tenantbindung, dass Job-
   `sync_activation_id`/`activation_generation` exakt dem Current-Pointer der
   gesperrten Series entsprechen, eine aktive Credentialgeneration, den
   aktuellen Aktivierungsstatus, die gepinnten und
   nicht suspendierten Provider-/Adapter-/Profil-/Capabilityversionen sowie den
   zulässigen Trigger. `paused`, `revoked`, `blocked_permission_evidence`,
   Credentialentfernung oder Contract-/Capability-Suspension invalidieren alle
   noch nicht begonnenen Jobs, Retries und Startup-Catch-ups, widerrufen
   vorhandene Leases und ergeben null Credential-Store-Zugriffe und null
   Brokerrequests. Ein bereits entschlüsselnder Worker darf nach erkannter
   Invalidierung keinen weiteren Request senden. `degraded` erlaubt nur
   explizite Recovery-/Auditläufe; Approval bleibt gesperrt.
4. Drei disjunkte Pflichtlanes werden getrennt geführt:
   `incremental_fast_6h` liest ab persistierter High-Watermark mit mindestens
   72 Stunden Overlap, `rolling_audit_7d_daily` mindestens täglich die jüngsten
   sieben vollständigen UTC-Tage und `rolling_audit_28d_weekly` mindestens alle
   sieben Tage das vollständige 28-Tage-Onboardingprofil. Diese Overlaps
   mindern das Risiko von Revisionen und Late Arrivals, behaupten aber keine
   Provider-Vollständigkeit.
5. Stabilität wird ausschließlich für unveränderliche, geschlossene UTC-
   Tagessegmente berechnet. Die kanonische Digestdomain
   `stability_bucket_identity` bindet exakt Provider-ID, tenantgebundenes
   Account-HMAC, `sync_activation_id` und `activation_generation`,
   `capability_id`, typisierten Instrument-/Accountscope,
   `provider_contract_version`, `adapter_version`, `profile_id`,
   `profile_version`, `boundary_policy_version`, `bucket_start`, `bucket_end`
   und `digest_version`. Der laufende UTC-Tag kann nicht `observed_stable`
   werden. Keine Beobachtung darf über Aktivierungsgenerationen, Profil-,
   Contract-, Adapter-, Grenzpolicy- oder Digestversionen hinweg als zweite
   Stabilitätsbeobachtung wiederverwendet werden.
   Erst zwei aufeinanderfolgende, mindestens einen Schedulerlauf
   auseinanderliegende Beobachtungen derselben Bucketidentität mit identischem
   Scope-, Eventset- und Content-Digest ergeben `observed_stable`. `partial`,
   offene Pages, unbekannte Shapes, Capabilityfehler oder geänderte Digests
   blockieren beziehungsweise invalidieren die Stabilitätsgeneration. Dieser
   Status bedeutet ausschließlich „zweimal identisch gelesen“, niemals „bei
   MEXC vollständig“.
6. `SYNC_LANE_STATE.health` ist die persistierte Health-Autorität. Der eindeutige
   Lane-Grain bindet Aktivierungsgeneration, Brokerkonto, Capability,
   Instrument-/Accountscope, die disjunkte `lane_id`, `profile_id`,
   `profile_version` und `policy_generation`. Jede Pflichtlane führt getrennt
   `last_complete_at`, `next_due_at`, letzten vollständigen Scope-Digest,
   letzten Fehler und eine optionale Gap-Referenz. Activation Health ist nur ein
   abgeleitetes Aggregat über alle Pflichtlanes; ein Scope darf höchstens einen
   unveränderlichen Health-Snapshot bei Abschluss tragen. Wird auch nur eine
   Pflichtlane überfällig, ist das Aggregat `degraded`; nur ein vollständiger
   Erfolg genau dieser Lane kann ihren Zustand wieder gesund setzen. Jede
   bekannte unbelegte oder unprüfbare
   Überlappung mit einem Candidate erzeugt sofort `gap_unproven` und sperrt
   Auswahl, Approval und Import. Sieben beziehungsweise 28 Tage sind nur
   Eskalations- und Recoveryfristen, keine erste Sperrschwelle und kein
   Korrektheitsbeweis; bei mehr als 28 Tagen, unbekannter Grenze oder einem
   nicht resumierbaren Sourcefehler wird `requires_export` oder `unsupported`
   gesetzt.

   `derive_capture_health_v1` gilt artefaktübergreifend:

   ```text
   revoked lifecycle -> revoked
   paused lifecycle -> paused
   inactive/blocked_permission_evidence/pending or missing required lane -> pending
   else any current required lane gap_requires_export -> gap_requires_export
   else any current required lane degraded/overdue/open non-export gap -> degraded
   else active and every current required lane healthy -> healthy
   else -> pending
   ```

   `revoked`/`paused` steuern den Arbeitsstopp, löschen aber keine strengere
   darunterliegende Lane-/Gap-Evidenz. Nach Resume wird aus den unveränderten
   aktuellen Lane States neu abgeleitet. Candidate, Auswahl, Approval, Import,
   Recovery und Lane-Healing lesen immer aktuelle Lane States, niemals einen
   historischen Run-/Scope-Snapshot.
7. Paging wird je fixiertem Scope bounded und resumable verarbeitet. Unbekannte
   Sortierung, Boundary-Inklusivität, terminale Seite, Snapshotstabilität,
   Revision oder Late-Arrival-Semantik bleiben als Providerunsicherheit
   sichtbar. Ein Page-/Endpoint-/Symbolfehler erzeugt `partial`, nie eine leere
   Erfolgsaussage.
8. Eine bei Aktivierung bereits offene Position oder ein Cycle mit erster
   beobachteter Execution am linken Rand erhält `blocked_left_boundary`.
   Importfähigkeit entsteht erst durch belegten Export-/API-Vorlauf oder durch
   eine später beobachtete Flat-Grenze und einen vollständig danach begonnenen
   neuen Cycle. Eine Carry-in-Position wird nicht aus Durchschnittspreis oder
   aktueller Menge zurückerfunden.
9. Der Scheduler schreibt nur Raw-/Normalisierungs-/Reconciliationdaten. Ein
   endgültiger lokaler Journal-Trade entsteht weiterhin ausschließlich nach
   Human Approval gemäß DEC-5761-016; es gibt keinerlei Brokerwirkung.
10. Die Statusachsen bleiben getrennt: `coverage_basis`,
    `scope_completeness`, `stability_status`, autoritatives `lane_health`,
    abgeleitetes `capture_health` und `gap_status`.
    `observed_stable` ist nur Beobachtungsgesundheit und erzeugt allein weder
    `reviewable` noch Importeligibility. Vor Candidate-Erzeugung,
    Sammelauswahl, Approval-Erzeugung und Import wird derselbe serverseitige
    Eligibility Predicate gegen alle den Cycle schneidenden Pflichtbuckets und
    -lanes, Event-Contract-Authority-, Financial-Currency-Authority- und
    Funding-Expectation-Evidence neu berechnet.

    ```text
    coverage_basis = provider_observed | provider_export_observed
    coverage_policy = strict_export_verified | provider_observed_best_effort | pending_user_policy
    scope_completeness = complete_for_profile | partial | failed | unverified
    stability_status = not_observed | observed_once | observed_stable | invalidated
    lane_health = healthy | degraded | gap_requires_export | paused
    capture_health = pending | healthy | degraded | gap_requires_export | paused | revoked
    gap_status = open | degraded | requires_export | reconciled | unsupported
    ```
11. Gemäß DEC-5761-024 gilt für MEXC die ausdrücklich gewählte Coverage Policy
    `provider_observed_best_effort`. Zwei identische Digests, Cross-Grain-
    Reconciliation und belegte Flat-Grenzen können fehlende Einzelereignisse
    erkennen, aber nicht ausschließen, dass der Provider einen vollständigen
    passenden Entry-/Exit-Cycle konsistent auslässt. Nach erfülltem technischen
    und finanziellen Eligibility Predicate darf ein solcher Candidate dennoch
    `reviewable` werden; Coverage Basis `provider_observed`, Status „nicht
    exportverifiziert“ und `silent_omission_risk` bleiben in Candidate,
    Approval, Journal-Trade und Auswertungen dauerhaft sichtbar.

**Historischer Exportpfad**

Die offizielle Account-Export-Dokumentation nennt Futures-Exporte als Excel
oder PDF, bis zu drei Jahre pro Report und derzeit frühestens ab 2024-10-01.
Für strukturierte Importe ist ausschließlich das originale Excel-Artefakt
vorgesehen; PDF ist nicht importfähig, und eine manuelle Excel-zu-CSV-
Konvertierung ist wegen möglicher ID-, Zeit- und Decimalveränderung kein
bevorzugter Quellvertrag.

`mexc_account_export_excel` bleibt in v57.61.0 `planned_unverified`, bis ein
lokal bereitgestelltes, sicher behandeltes Beispiel den Dateiaufbau, Grains,
IDs, Zeitzonen, Währungen, Counts und Joinpfade belegt und A3/A4/A5 das
Dateiprofil separat reviewt haben. Unbekannte oder veränderte Schemas werden
fail-closed abgelehnt. Diese optionale Backfill-/Recoverycapability blockiert
nicht das G0-Design des prospektiven API-Scopes, darf aber vor ihrem eigenen GO
weder implementiert noch als verfügbar beworben werden. Daten vor 2024-10-01
bleiben ohne andere autoritative Quelle `unsupported`.

**Evidenzgrenze**

Die am 2026-08-05 vom Nutzer bereitgestellten Supportaussagen sind
`user_supplied_provider_support_statement`, nicht normativer API-Vertrag. Die
Telegram-Aussage „keine feste Retention“ und die Ticket-Aussage „jüngster
Monat“ werden gemeinsam als `support_claimed_operational_horizon` erfasst. Sie
belegen weder garantierte 28/30/31 Tage noch Vollständigkeit. Die verbleibende
Unsicherheit wird durch Scopebegrenzung, wiederholte Digests, Gap Ledger,
sichtbaren Healthstatus und optionalen Export-Recovery kontrolliert, nicht
durch eine erfundene Providergarantie.

Die dritte Ticketantwort bestätigt `View Order Details` für relevante Futures-
History-Endpoints, trennt davon `Order Placing` und beschreibt das aktuelle
Ergebnisverhalten als reverse chronological, neueste Records zuerst. Das
schließt die Permission-Mappingfrage des gepinnten History-Profils auf
Designebene; konkrete Keyrechte bleiben Nutzerattestierung. Die Sortierangabe
bleibt `support_claimed_current_behavior`: jede Page und jeder Pageübergang wird
später validiert; Abweichung erzeugt `partial`/`contradicted`.

**G0-Akzeptanzkriterien**

- Keine UI- oder API-Aussage behauptet vollständige MEXC-Historie oder
  garantierte Ein-Monats-Retention.
- Prospektive Capture-, Onboarding-, Audit-, Gap- und Boundaryzustände sind im
  Providervertrag, ERD und Betriebsdesign identisch definiert.
- G1 spezifiziert Scheduler-, Overlap-, Paging-, Digest-, Restart-, Clock- und
  Gap-Fixtures; ausgeführte Provider-/DB-Evidenz folgt G2–G6.
- Ein späterer Excel-Backfill erhält einen eigenen versionierten Dateivertrag
  und kann den prospektiven API-Adapter nicht still erweitern.

### DEC-5761-010 – Gebühren, Funding, Währungen und Netto-PnL

| Feld | Wert |
|---|---|
| Status | `DESIGN_ACCEPTED`; Provider-/Golden-Evidenz folgt G2/G3 |
| Owner | A5 |
| Reviewer | A2, A3, A4 |

**Entscheidungsvorschlag**

Für jeden Position Cycle werden getrennt gespeichert und ausgewiesen:

- Brutto-Closing-PnL;
- Tradinggebühren je Fill und Gebührenwährung;
- Funding-Zahlungen je Settlement und Währung;
- sonstige brokerbelegte Kosten oder Gutschriften mit eigener Art;
- Netto-PnL je Währung;
- optional konvertierte Berichtswerte mit Quelle, Kurszeitpunkt und
  Konvertierungsregel.

Keine Währung wird still einer Preset- oder Kontowährung gleichgesetzt.
Fehlende oder widersprüchliche Währungen blockieren aggregierte PnL-Kennzahlen.
Providerwerte und lokal berechnete Werte bleiben getrennt und werden
reconciled; ein Providerwert überschreibt nicht still die lokale Berechnung.

Kanonische Vorzeichen gelten aus Sicht des Kontoequity-Effekts:

- positive Beträge erhöhen das Kontoequity, etwa realisierter Gewinn,
  Fundinggutschrift oder Fee-Rebate;
- negative Beträge vermindern das Kontoequity, etwa Verlust, gezahlte Fee oder
  Fundingbelastung.

Das rohe Providervorzeichen und die zugehörige Providerfeldsemantik bleiben
zusätzlich erhalten. Eine Adapter-Normalisierung darf ein Vorzeichen erst
umkehren, wenn Providervertrag und Fixture die Quellsemantik belegen.

Jede gebuchte Finanzkomponente besitzt genau eine versionierte Authority Rule:
entweder atomare Providerbuchung oder lokale Valuation aus vollständigen,
typisierten Inputs. Weitere überlappende Providerwerte sind ausschließlich
`reference_only` und werden nicht addiert. Insbesondere dürfen Execution-Fee
plus Position-`fee`
oder `totalFee` sowie Execution-PnL plus Position-`closeProfitLoss` oder
`realised` nicht ohne belegte Nichtüberlappung summiert werden. Eine fehlende
Primärquelle wird nicht still durch ein Aggregat ersetzt.

Für v57.61.0 gilt als vorgeschlagene, noch durch Providervertrag und Golden
Fixtures zu bestätigende Autoritätsmatrix:

| Komponente | Primäre Buchungsquelle | Nur Reconciliation Reference | Verboten |
|---|---|---|---|
| Trading Fee/Rebate | belegtes Execution- oder Accountbuchungsfeld je wirtschaftlicher Buchung | Order-/Positionsaggregat | Aggregat zusätzlich zur Primärsumme addieren |
| Brutto-Closing-PnL | lokale Berechnung aus vollständigen Executions und belegtem Valuation-Modell oder ausdrücklich belegte atomare Providerkomponente | überlappende Execution-/Positions-PnL-Felder | mehrere überlappende Provideraggregate addieren |
| Funding | konkretes kontobezogenes Funding Event | Position-Fundingaggregat oder öffentliche Rate | öffentliche Rate als Zahlung buchen |
| Sonstige Kosten/Gutschrift | ausdrücklich belegte Kontobuchung | Rate, Konfiguration oder Aggregat | Referenzwert als Zahlung buchen |

Kann eine Quelle nicht eindeutig als `booked` oder `reference_only`
klassifiziert werden, bleibt die Komponente `not_comparable` und der Kandidat
blockiert.

Dieselbe atomare Quelle darf über mehrere aktuelle Candidate Revisions niemals
doppelt gebucht werden. Bei einem belegten Split – insbesondere Fee/Rebate bei
einer Reversal-Execution – werden Quellbetrag, Currency, Coverage-Anteil,
Teilbetrag und Splitregel versioniert; alle aktiven Teilbeträge summieren sich
exakt zum Quellbetrag. Unbelegter Rest blockiert. Funding Events und atomare
Accountbuchungen folgen derselben Summeninvariante. Der eröffnende Anteil eines
Reversals erhält kein realisiertes PnL, sofern dessen Provider-Coverage nicht
belegt ist.

### DEC-5761-011 – PnL- und Rundungstoleranzen

| Feld | Wert |
|---|---|
| Status | `DESIGN_ACCEPTED`; konkrete Provider-/Golden-Epsilonevidenz folgt G3 |
| Owner | A5 |
| Reviewer | A2, A3 |

**Entscheidungsvorschlag**

Toleranzen sind komponenten-, instrument-, Authority-, Coverage- und
währungsbezogen. Zwei Beträge sind nur vergleichbar, wenn Komponententyp,
Currency, wirtschaftliche Source/Coverage, Vorzeichenkonvention,
`authority_mode`, Providerfeld-/Berechnungsdefinition und Valuation-/
Formelversion identisch beziehungsweise ausdrücklich äquivalent belegt sind.
Andernfalls lautet das Ergebnis unabhängig vom Betrag `not_comparable`.

Für einen vergleichbaren Decimalbetrag gilt normativ:

```text
delta = abs(local_amount - authoritative_provider_amount)

delta = 0                 => exact
0 < delta <= epsilon      => within_documented_tolerance
delta > epsilon           => mismatch
epsilon < 0 oder unbelegt => not_comparable
```

Die obere Grenze ist inklusiv. Berechnung und Vergleich erfolgen lossless in
Decimal; binäre Gleitkommaarithmetik und vorheriges Runden auf Anzeigepräzision
sind verboten.

`epsilon` wird als exakte nichtnegative Decimalgrenze aus einer versionierten,
expliziten Fortpflanzung sämtlicher belegter Rundungsschritte der konkreten
Formel abgeleitet, beispielsweise Price-, Quantity-/Volume-, Multiplier-,
Settlement- und Providerbuchungsrundung in ihrer tatsächlichen Reihenfolge. Ein
bloßer Precision-, Tick- oder Scale-Hinweis ohne diese Fehlerfortpflanzung
begründet keine Toleranz. Ein pauschaler prozentualer Wert ist unzulässig.

Reconciliation klassifiziert mindestens:

- `exact` – `delta = 0`;
- `within_documented_tolerance` – `0 < delta <= epsilon` bei vollständig
  belegtem Comparator;
- `mismatch` – `delta > epsilon` bei vollständig belegtem Comparator;
- `not_comparable` – Vergleichsdimension oder belegtes `epsilon` fehlt.

Nur `exact` und nach A5-Review `within_documented_tolerance` können
importierbar sein.

Die Toleranz wird als exakte Decimalgrenze in der jeweiligen Komponenten-
währung beziehungsweise Mengeneinheit gespeichert. Sie enthält Quelle,
Contract-Metadatenversion, Rundungsschritte und Formelversion. Eine
Währungsumrechnung darf nicht Teil der Quelltoleranz sein. Abweichungen dürfen
weder zwischen Fee, Rebate, Funding, PnL oder sonstigen Komponenten noch über
mehrere Providerfelder, Candidates oder Währungen saldiert werden. Insbesondere
darf ein positiver Fehler keinen negativen Fehler oder einen Net-PnL-Gleichstand
kompensieren. FX-Vergleiche sind getrennte, versionierte Valuationen und niemals
Teil dieses Source-Comparators.

### DEC-5761-012 – Reimport und Schutz manueller Nutzerfelder

| Feld | Wert |
|---|---|
| Status | `DESIGN_ACCEPTED`; Revert-/Statistik-/Tombstone-Evidenz folgt G4–G6 |
| Owner | A6 |
| Reviewer | A5, A2, A3 |

**Entscheidungsvorschlag**

Brokerabgeleitete Finanz- und Provenienzfelder sind versioniert und werden nur
über eine neue Kandidatenrevision aktualisiert. Manuelle Notizen, Tags, Bilder,
Bewertungen und Setup-Zuordnungen werden bei Reimport oder Revert nicht
überschrieben oder gelöscht.

Ein bereits importierter wirtschaftlicher Brokerkey erzeugt keinen zweiten
Trade. Ändert sich die Brokerquelle, entsteht `needs_review`; eine neue
Nutzerfreigabe ist erforderlich.

**Normative Feld-Ownership- und Postcondition-Matrix**

| Datenklasse | Reimport | Journalimport revertieren | Credential entfernen | Verbindung deaktivieren | Raw History erasen |
|---|---|---|---|---|---|
| Nutzerfelder: Notizen, Tags, Bilder, Bewertung, Setup-Zuordnung | unverändert | unverändert erhalten | unverändert | unverändert | unverändert, sofern kein separat gelöschtes Raw-Artefakt eingebettet ist |
| Brokerabgeleitete Finanzwerte: Menge, Preis, Fee, Funding, PnL, Währung, Valuation | nur über neue Candidate Revision und erneutes Approval ersetzbar | aus dem aktiven Journal-Trade entfernen; keine Werte in einen manuellen Ersatz übertragen | unverändert | unverändert | nur erhalten, wenn die freigegebene Retention-/Provenienzpolicy dies erlaubt; andernfalls Candidate/Trade vor Erasure blockieren |
| Brokerabgeleitete Markt-/Zeitfelder: Providerinstrument, Entry/Exit, Side, Mode, Cycle | wie Finanzwerte | aus dem aktiven Journal-Trade entfernen | unverändert | unverändert | wie Finanzwerte |
| Raw Events und Observations | append-only neue Observation; kein Überschreiben | unverändert, Importrelation als `reverted` markieren | unverändert | unverändert | kontrolliert löschen/anonymisieren, erst nach DEC-5761-013 |
| Normalisierte Quellen und Candidate Revisions | neue Revision; alte superseded/stale | unverändert auditierbar, Candidate-/Importstatus `reverted` | unverändert | unverändert | nach freigegebener Policy löschen/anonymisieren oder Erasure blockieren |
| Approval und Importresultat | altes Approval bei fachlicher Änderung invalid | `reverted`, nicht erneut konsumierbar | unverändert | unverändert | minimale zulässige Audit-/Tombstoneform nach DEC-5761-013 |
| Credential | unverändert | unverändert | verschlüsseltes Credential atomar löschen; kein Klartext-/Backuprest im Anwendungsbestand | unverändert | unverändert |
| Connection-/Accountzuordnung | unverändert | unverändert | für neue Syncs sperren; Kontoidentität nicht automatisch löschen/zusammenführen | deaktivieren; keine neuen Syncs | nur nach separater Account-/Identity-Retentionpolicy |
| Reimport-Tombstone | bei Treffer Reimport blockieren und Nutzeraktion verlangen | erzeugen/aktualisieren | unverändert | unverändert | nur nach eigener freigegebener Retention; niemals Raw-Payload oder rohe Provider-ID |

Existieren beim Revert keine manuellen Felder oder nichtbrokerbezogenen
Referenzen, wird der ausschließlich brokererzeugte lokale Journal-Trade atomar
entfernt. Andernfalls bleibt ausschließlich ein Zustand
`detached_manual_draft`: Nutzerfelder bleiben erhalten, alle
brokerabgeleiteten Finanz-, Markt-, Zeit-, Providerkonto- und Provenienzfelder
werden aus der aktiven Journalansicht entfernt beziehungsweise auf den
geschützten `reverted`-Auditpfad entkoppelt. Der Draft ist kein Journal-Trade,
ist nicht approvable/imported und zählt weder zu PnL, Equity, Win Rate,
Kalender, Haltezeit, Tradeanzahl noch zu Finanz-/Steuerexporten. Die UI zeigt
textlich „Entkoppelter manueller Entwurf – nicht in Statistiken“. Eine spätere
Umwandlung in einen rein manuellen Journal-Trade ist eine getrennte explizite
Nutzeraktion mit neuer lokaler Identität; Brokerwerte werden nicht übernommen.

Jede Aktion zeigt vor Bestätigung getrennte Counts für zu löschende,
zu entkoppelnde, zu bewahrende und weiterhin gesperrte Datensätze sowie die
Statistik- und Reimportfolge. Credential-Löschung in Equora behauptet nie einen
Providerwiderruf. Raw-Erasure wird erst auswählbar, nachdem die in
DEC-5761-013 akzeptierte Policy in G5/G6 ownergebunden, atomar und mit Export-/
Negativtests implementiert wurde; bis dahin existiert keine automatische
Erasure.

### DEC-5761-013 – Verbindung entfernen, Daten löschen und Retention

| Feld | Wert |
|---|---|
| Status | `DESIGN_ACCEPTED – USER POLICY APPROVED 2026-08-04`; externe Rechtsprüfung vor Pilot/Kundenbetrieb bleibt Pflicht |
| Owner | A4 |
| Reviewer | A6, A2, A3; externe Rechtsprüfung vor Kundenbetrieb |

**Entscheidung**

Vier Vorgänge bleiben getrennt:

1. Credential entfernen und Nutzer zum separaten Widerruf bei MEXC auffordern.
2. Verbindung deaktivieren, ohne automatisch Brokerhistorie zu löschen.
3. Importierte Journal-Trades kontrolliert revertieren und manuelle
   Anreicherungen bewahren.
4. Raw History nach Export-/Retention-/Rechtsregeln erasen oder anonymisieren,
   ohne Importidentität und notwendige Provenienz unkontrolliert zu verlieren.

Vor jeder destruktiven Aktion werden Counts, verbleibende Daten,
Reimportfolgen und Exportmöglichkeit angezeigt. Tombstones verhindern, dass
gelöschte Quellen später unbemerkt erneut importiert werden.

Ein Tombstone enthält keine Raw-Payload und keine rohe Provider-ID. Soweit ein
Reimportschutz fachlich und rechtlich erforderlich bleibt, verwendet er einen
zweckgebundenen, versionierten HMAC-Digest mit eigener Retention. Auch ein
Tombstone kann personenbezogen sein und ist deshalb kein unbegrenzt
aufzubewahrendes Auditobjekt.

**Verbindliche Retention-/Erasure-Matrix für v57.61.0**

| Datenklasse | Regelfrist / Auslöser | Ablaufwirkung |
|---|---|---|
| Vollständiger dekomprimierter Raw-Response-Body nach erfolgreicher Normalisierung | 30 Kalendertage ab `normalized_at` | Body kontrolliert erasen; Content-/Event-/Source-Digests und zulässige minimale Provenienz getrennt nach den folgenden Regeln erhalten |
| Raw-Body eines blockierten, ungeklärten oder nicht normalisierbaren Events | maximal 90 Kalendertage ab erster `observed_at` | vor Ablauf Exportmöglichkeit und Löschfolge anzeigen; danach Body erasen, abhängige Candidates dauerhaft `blocked_erased_source`, niemals aus Restdaten rekonstruieren |
| Sanitiserte Run-/Page-/Fehler-Metadaten ohne Payload, Provider-ID, Credential, Signatur oder wirtschaftliche Einzelwerte | 180 Kalendertage ab terminalem Runstatus | vollständig löschen oder irreversibel aggregieren; Supportreferenz darf keinen Personen-/Accountbezug erhalten |
| Originales `SOURCE_ARTIFACT` in Quarantine | nur bis zum terminalen Inspect-/Parsezustand, höchstens sieben Kalendertage ab Auswahl | bei `rejected` sowie nach erfolgreichem terminalem Parse innerhalb von 24 Stunden Binärartefakt erasen; sofort bei Nutzerlöschung; nur zulässige Digests, Profilversion, Counts und sanitiserte Statusmetadaten erhalten |
| Sanitiserte `FILE_PARSE_RESULT`-/Artifact-Metadaten ohne Filename, Pfad oder Zellinhalt | 180 Kalendertage ab terminalem File Run | vollständig löschen oder irreversibel aggregieren; normalisierte Quellen folgen ihrer Source-/Candidate-Retention |
| Normalisierte Sources, Candidate Snapshot und notwendige Provenienz eines importierten lokalen Journal-Trades | solange der Journal-Trade besteht, danach 30 Kalendertage ab Trade-Löschung oder Revert | nach Frist löschen/anonymisieren; `detached_manual_draft` erhält keine Brokerfinanz-, Markt-, Zeit-, Account- oder aktive Provenienzfelder |
| Normalisierte Sources/Candidates ohne erfolgreichen Import | höchstens 90 Kalendertage ab letzter fachlicher Revision | löschen/anonymisieren; zugehöriger Candidate bleibt danach nicht importierbar |
| Verschlüsseltes Credential im aktiven Store | bis explizite Nutzeraktion „Credential entfernen“ | sofort für neue Syncs sperren und atomar aus aktivem Store löschen; keine automatische Löschung von Raw History oder Journal-Trades |
| Credentialreste in verschlüsselten Backups | regulärer Backupzyklus, maximal 30 Kalendertage nach aktiver Löschung | automatisch auslaufen lassen oder über belegtes Cryptographic Erasure unbrauchbar machen; lokales Löschen ersetzt keinen Providerwiderruf |
| Reimport-Tombstone-HMAC | 12 Monate ab Revert/Erasure | anschließend löschen; vor Ablauf sichtbar darauf hinweisen, dass mit Löschung der technische Reimportschutz endet |
| Manuelle Notizen, Tags, Bilder, Bewertung und Setup-Zuordnung | bis zur getrennten Nutzerlöschung | durch Broker-Revert/Raw-Erasure nicht automatisch löschen; nach Nutzerlöschverlangen nach der unten definierten Frist erasen |

Fristen werden in UTC ab einem unveränderlichen serverseitigen Auslöser
berechnet. Ein Retention Worker darf nur ownergebundene, policyversionierte,
idempotente Batches verarbeiten und muss bei fehlender Policyversion,
ungeklärter Referenz, Legal Hold oder Count-/Scope-Mismatch fail-closed stoppen.
Eine abgelaufene Raw-Quelle darf niemals durch ein berechnetes oder verkürztes
Ersatzpayload scheinbar wiederhergestellt werden.

**Aktions- und Löschregeln**

- Credentialentfernung, Connection-Deaktivierung, Journal-Revert und Raw-
  Erasure bleiben vier getrennte, niemals vorausgewählte Aktionen.
- Vor Raw-Erasure werden autoritative Counts, betroffene Candidates/Journal-
  Trades, Statistik-/Reimportfolge und ein optionales Exportangebot angezeigt.
  Der Verzicht auf Export verhindert ein berechtigtes Löschverlangen nicht.
- Ein Nutzerlöschverlangen sperrt die betroffenen Daten sofort gegen neue
  Verarbeitung. Ohne ausdrücklich dokumentierten Legal Hold wird die Löschung
  beziehungsweise Anonymisierung spätestens innerhalb von 30 Kalendertagen
  abgeschlossen.
- Automatisch fällige Retention wird je Connection und Datenklasse aggregiert
  spätestens sieben Kalendertage vor dem geplanten Lauf als persistierte In-App-
  Meldung mit Counts, Fälligkeitszeit, Export- und Löschfolge angekündigt. Der
  Zustand `scheduled`, `shown`, `acknowledged`, `executed` oder `failed` wird
  serverseitig auditierbar geführt; eine fehlende oder fehlerhafte Pflicht-
  Meldung blockiert die automatische Erasure. Nutzerinitiierte interaktive
  Erasure zeigt ihre Folgen im Bestätigungsdialog und wird durch diesen
  Vorankündigungsvertrag weder verzögert noch automatisch vorausgewählt.
- Das Ende eines Reimport-Tombstones wird 30 und sieben Kalendertage vor Ablauf
  als persistierte In-App-Meldung angekündigt. Sie erklärt ausdrücklich, dass
  nach der Löschung ein späterer Reimport nicht mehr durch diesen Tombstone
  verhindert wird. Ein E-Mail-/Push-Kanal ist ohne separate Channel-
  Einwilligung kein Pflicht- oder Fallbackkanal.
- Ein Legal Hold ist kein stiller Default. Er benötigt Rechtsgrund,
  verantwortliche Stelle, Scope, Start, Review-/Enddatum und sichtbaren
  Sperrstatus; für v57.61.0 ist kein Legal Hold angenommen.
- Beim Revert erzeugte `detached_manual_draft`-Datensätze bleiben aus allen
  Finanz-/Statistik-/Steuerpfaden ausgeschlossen. Ihre manuellen Felder folgen
  ausschließlich der separaten Nutzerlöschung.
- Vor externem Pilot-, Kunden- oder White-Label-Betrieb müssen Rechts- und
  Datenschutzprüfung diese Fristen, Backupbehandlung, Exportbedingungen und
  Betroffenenrechte bestätigen oder versioniert ersetzen. Bis dahin bleibt
  externer Betrieb NO-GO.

### DEC-5761-014 – Credential-Master-Key-Rotation

| Feld | Wert |
|---|---|
| Status | `DESIGN_ACCEPTED`; Rotation-/Recovery-Evidenz folgt G5/G6 |
| Owner | A4 |
| Reviewer | A2, A3 |

**Entscheidungsvorschlag**

- Getrennte Dev-, Preview- und Produktions-Master-Keys.
- Das Ciphertext-Envelope enthält mindestens Algorithmus-/Formatversion,
  Key-ID, Nonce/IV und Authentisierungstag; es enthält niemals den Key selbst.
- Neue Credentials werden mit der aktuellen Key-Version geschrieben.
- Während einer kontrollierten Rotation darf der Server aktuelle und vorherige
  Version lesen, aber nur mit der aktuellen Version schreiben.
- Re-Encryption erfolgt batchweise, idempotent und auditierbar.
- Vor Abschluss wird geprüft, dass kein Credential auf der alten Version
  verbleibt.
- Eine gesicherte Recovery-Kopie und ein getestetes Recovery-Runbook sind vor
  produktiver Rotation Pflicht.
- Blindes Ersetzen eines produktiven Master-Keys ist verboten.

### DEC-5761-015 – Aktueller MEXC-Host und Endpointversionen

| Feld | Wert |
|---|---|
| Status | `ACCEPTED – BOUNDED NON-PRODUCTION HOST/PATH/READ OBSERVATION` |
| Owner | A2 |
| Reviewer | A4, A3, A5 |

**Evidenz**

Die am 2026-08-04 abgerufene offizielle MEXC-Futures-Dokumentation nennt
`https://api.mexc.com` als Basisdomain. Der Change Log dokumentiert die
Umstellung zum 2026-01-19. Der aktuelle Equora-Connector verwendet noch
`https://contract.mexc.com`.

Die aktuelle Dokumentation nennt für historische Deals
`GET /api/v1/private/order/list/order_deals/v3`; der Connector verwendet den
älteren Pfad ohne `/v3`.

**Entscheidungsvorschlag**

Der neue MEXC-Adapter darf ausschließlich eine statische Allowlist aus der
aktuellen, versionierten Providervertragsrevision verwenden. Vor einer
Codeänderung müssen Responseform und Pfade mit synthetischen Fixtures und einem
separat freigegebenen, read-only Nichtproduktions-Contract-Probe bestätigt
werden. Kein Fallback auf undokumentierte Hosts oder Pfade erfolgt still.

Die am 2026-08-04 freigegebene credentialfreie Public-Phase beobachtete den
aktuellen Origin `https://api.mexc.com`, Serverzeit- und Contract-Metadata-Pfad,
HTTP 200, keinen Redirect sowie die erwarteten Envelope-/Metadata-Grundtypen.

Die anschließende credentialgebundene Private-Phase bestätigte im festen
Nichtproduktions-Scope HTTP-2xx-/`success/code=0`-Antworten für Historical
Orders, Historical Executions `/v3`, Historical Positions und Funding Fee
Details. Genau diese vier privaten Requests waren signierte `GET`s; es war
keine Mutationsmethode registriert. Damit sind aktueller Host, die verwendeten
privaten Pfade einschließlich `/v3` und die erfolgreiche Authentisierung genau
dieser vier konkreten GET-Requests für den beobachteten Stand ausreichend
entschieden. Der vollständige Signatur-/Canonicalization-Vertrag einschließlich
Encoding-, Nullparameter-, Skew-/Expiry- und Golden-Vector-Evidenz bleibt G1.
Legacy-Host und Dealpfad ohne `/v3` bleiben unzulässig.

Der nachfolgende Discovery-Probe beobachtete zusätzlich reale Order-,
Execution- und Funding-Itemshapes sowie ein verschiedenes Orderitem auf Page 2.
Dies erweitert die Host-/Pfadentscheidung nicht zu einer globalen Paging-,
Retention-, Filter- oder Sortiergarantie. Diese Restunsicherheiten verbleiben
explizit in DEC-5761-009/018 und den zugehörigen Findings; sie werden nicht
durch den `ACCEPTED`-Status dieser reinen Host-/Pfad-/Read-Entscheidung
verdeckt.

Die Host-/Pfadbeobachtung bleibt als Fakt verwertbar; ihr `ACCEPTED`-Status
erklärt den Probe nicht governancekonform und schließt BRI-031 nicht.

### DEC-5761-016 – Human Approval und automatischer Import

| Feld | Wert |
|---|---|
| Status | `ACCEPTED – USER PRODUCT DIRECTION RECONFIRMED 2026-08-05` |
| Owner | A6 |
| Reviewer | A5, A4, A3, A2 |

**Entscheidung**

Ohne explizite Nutzeraktion entstehen keine Journal-Trades. Automatisches
read-only Erfassen, Normalisieren und Reconciliieren nach einer späteren
expliziten Connection-/Scheduleraktivierung ist davon getrennt und darf keine
Journal-Trades erzeugen. Es gibt keine Vorauswahl und keinen unmittelbaren
Ein-Klick-Gesamtimport. Approval ist an Nutzer,
Providerkonto, Sync-Stand, Kandidatenrevision, Regelversion und Snapshot-Digest
gebunden und single-use.

Die UI darf eine explizite Aktion „Alle aktuell importierbaren auswählen“
anbieten. Sie wird niemals automatisch ausgeführt oder vorausgewählt und zeigt
vor einer getrennten finalen Bestätigung Counts, Scope, finanzielle Summen je
Währung, Ausschlüsse und Blocker. Vor der finalen Bestätigung kann der Nutzer
den Drill-down jeder Revision öffnen und einzelne Candidates wieder abwählen.
Dadurch entfällt das händische Abtippen und Einzelauswählen vollständiger Trades,
ohne Human Approval zu umgehen.

Neue Raw Events, Contract-Metadaten, Fundingdaten oder
Reconciliation-Ergebnisse invalidieren die Freigabe und setzen
`needs_review`. `partial`, `mismatch`, `not_comparable`, unbekannte Quelle oder
fehlende Provenienz sind technisch nicht auswählbar.

Die Bestätigungsansicht zeigt mindestens Provider, Providerkonto/Umgebung,
Synczeitraum, technischen Lese-/Coverage-Status je Pflichtquelle, Cycle-
Grenzstatus, Menge, Entry/Exit, jede PnL-Komponente und Währung sowie die
Reconciliationklasse.
Nicht belegte Währungsumrechnungen oder zusammengefasste Mischwährungen werden
nicht als eine einzige Finanzsumme dargestellt. Änderungen nach Anzeige der
Bestätigungsansicht erzwingen einen neuen Snapshot und eine neue Bestätigung.

**Normativer UX-Zustands- und Aktionsvertrag**

Jeder sichtbare Zustand wird serverseitig aus persistierter Evidenz abgeleitet,
als Text plus nicht nur farblichem Symbol dargestellt und enthält eine
sanitisierte Supportreferenz. Die Referenz enthält niemals Credential-,
Signatur-, Payload- oder rohe Provider-ID-Information. Statusänderungen werden
für assistive Technik als Text angekündigt. Kein Zustand wählt Kandidaten vor.

| UI-Zustand | Belegte Bedingung | Verbindliche sichtbare Aussage | Auswahl / Approval | Sichere Nutzeraktion |
|---|---|---|---|---|
| `profile_read_succeeded` / „Leseprofil technisch erfolgreich abgefragt“ | jede Pflichtcapability des benannten/versionierten Profils für exakt Providerkonto, Instrument-/Symbolscope und UTC-Zeitraum technisch erfolgreich; keine offene Seite, kein Fehler, kein unbekannter Shape | „Leseprofil `<profile_id>@<version>` für `<scope>` und `<from>–<to>` technisch erfolgreich abgefragt.“ Niemals „MEXC-Historie vollständig“ | nur bei zusätzlich erfülltem Candidate-/Coverage-Predicate Einzel- oder Sammelauswahl; niemals vorausgewählt | Coverage-Modus, Scope, Risiken, Auswahl und Folgen prüfen |
| `partial` / „Teilweise gelesen“ | mindestens eine gültige Quelle vorhanden, aber Pflichtcapability, Seite, Fenster oder Symbol fehlgeschlagen/offen | fehlende Pflichtquellen und betroffener Scope werden benannt; vorhandene Daten werden nicht als vollständig bezeichnet | vollständig gesperrt | ausschließlich fehlende lesende Work Units fortsetzen oder sicher erneut lesen |
| `provider_returned_no_data` / „Provider lieferte im abgefragten Scope keine Daten“ | alle Pflichtquellen des Profils und Scopes technisch erfolgreich und leer | keine Vollständigkeits- oder Nullbuchungsaussage; Scope und Providerantwort klar benennen | keine Kandidaten, kein Approval | Scope/Zeitraum ändern oder später erneut lesen |
| `permission_missing` / „Leseberechtigung fehlt“ | Providerfehler ist eindeutig einer konkret benannten Read-/View-Capability zugeordnet | nur fehlende View-/Read-Berechtigung benennen; niemals Trading-, Order-, Transfer- oder Withdrawalrechte empfehlen | vollständig gesperrt | beim Provider ausschließlich die konkret benannte Leseberechtigung prüfen; neuen Lesetest starten |
| `invalid_credential` / „Leseschlüssel ungültig“ | Authentisierung des strikt lesenden Profils abgelehnt | keine Aussage über Tradingrechte oder übrige Keyrechte | vollständig gesperrt | Credential lokal ersetzen und erneut bestätigen, dass beim Provider nur Lesen aktiv ist |
| `rate_limited` / „Leselimit erreicht“ | Provider-Rate-Limit mit persistierter Retryklasse | betroffenen Scope und frühesten sicheren Retry nennen, sofern belegt | vollständig gesperrt | bis zum sicheren Zeitpunkt warten oder später fortsetzen; keine Retryschleife |
| `provider_unreachable` / „Provider nicht erreichbar“ | Timeout, Netzwerk-, Wartungs- oder Providerfehler ohne validierte vollständige Response | keine „keine Daten“-Aussage | vollständig gesperrt | später sicher fortsetzen; Supportreferenz verwenden |
| `unverified` / „Providerverhalten nicht verifiziert“ | Dokumentation, Fixture, Providerbeobachtung oder Supportevidenz reicht für die Capability nicht aus oder widerspricht sich | konkrete unbestätigte Capability/Vertragsrevision nennen | vollständig gesperrt | keine Key-/Rechteausweitung; Contract-/Supportprüfung erforderlich |
| `needs_review` / „Erneute Prüfung erforderlich“ | Candidate-Input, Metadaten, Funding, Boundary, Regelversion oder Snapshot änderte sich nach Anzeige/Approval | geänderte fachliche Bereiche benennen; altes Approval als ungültig darstellen | altes Approval gesperrt; neue Auswahl erst nach neuer Reviewansicht | aktualisierte Revision vollständig prüfen und neu auswählen |
| `blocked_data_integrity` / „Nicht sicher importierbar“ | `blocked_boundary`, `mismatch`, `not_comparable`, `ambiguous_sequence`, unbekannte Quelle/Shape oder fehlende Provenienz | konkreten fail-closed Grund ohne erfundene Werte nennen | vollständig gesperrt | Scope vervollständigen oder Support-/Contractprüfung; kein manueller „trotzdem importieren“-Override |
| `gap_requires_export` / „Recovery erforderlich“ | unbelegter/unklarer Scope benötigt eine autoritative Recoveryquelle | „Recovery erforderlich; MEXC-Excel-Import noch nicht verfügbar.“ | vollständig gesperrt | Originalexport sicher aufbewahren, Journal gegebenenfalls manuell ergänzen oder auf separat freigegebenes Dateiprofil warten |
| `capability_read_succeeded` / „Lesetest erfolgreich“ | genau eine capability- und scopegebundene Leseoperation erfolgreich | Capability, Contractversion, Scope und Zeitpunkt nennen; kein generisches „MEXC sicher verbunden“ | kein Importclaim; Candidateauswahl nur über separaten vollständigen Profil-/Candidatezustand | weitere Pflichtcapabilities lesen oder Profilstatus prüfen |

Ein `profile_read_succeeded` wird nur sichtbar, wenn jede feste
Pflichtcapability des konkret benannten und versionierten Profils erfolgreich
war. `partial`, `failed`, `unverified` oder nicht ausgeführte Pflichtcapabilities
verhindern den Profilerfolg. Auch dieser Erfolg beweist ausschließlich die
getesteten Leseoperationen, nicht die vollständige Rechtekonfiguration des
Providerkeys.

Die Vorschau führt unabhängig vom Runzustand für jede Candidate Revision genau
eine fachliche Kategorie:

| Vorschaukategorie | Verbindliche Bedeutung | Auswahlwirkung |
|---|---|---|
| `importable` / „Importierbar“ | vollständig `reviewable`, alle Quellen/Boundaries/Authority-/Currency-/Allocation-/Reconciliationregeln und die gewählte Coverage-Assurance-Policy erfüllt, noch nicht importiert | sichtbar als „providerbeobachtet, nicht exportverifiziert“ oder „exportverifiziert“; einzeln oder über „Alle aktuell importierbaren auswählen“ auswählbar, niemals vorausgewählt; Blocker bleiben unselektiert |
| `already_imported` / „Bereits importiert“ | wirtschaftlicher Importkey existiert bereits erfolgreich | nicht erneut auswählbar; vorhandenen lokalen Journal-Trade anzeigen |
| `blocked` / „Blockiert“ | mindestens ein fail-closed Blocker wie Mismatch, fehlende Provenienz, `not_comparable`, `ambiguous_sequence` oder `unsupported_contract_family` | nicht auswählbar; konkreten Blocker und sichere nächste Aktion zeigen; bei `unsupported_contract_family`: „Dieser Contracttyp ist in v57.61.0 nicht importfähig. Unterstützt werden ausschließlich eventzeitlich belegte lineare USDT-/USDC-M-Contracts. Gelesene Rohdaten bleiben als blockierte Evidenz sichtbar.“ |
| `open` / „Offene Position“ | Cycle ist fachlich noch nicht beendet oder rechte Grenze nicht vollständig | nicht auswählbar; späteren sicheren Leselauf anbieten |
| `unassigned` / „Nicht zugeordnet“ | valide Quelle kann noch keinem eindeutigen Candidate/Cycle zugeordnet werden | nicht auswählbar; keine manuelle Finanzwertübersteuerung |
| `excluded` / „Bewusst ausgeschlossen“ | versionierte Regel schließt die Quelle mit dokumentiertem Grund aus | nicht auswählbar; Regelversion und Grund anzeigen |

Runstatus und Vorschaukategorie dürfen sich nicht gegenseitig verschleiern. Ein
`partial` oder `unverified` Run sperrt Approval auch dann vollständig, wenn eine
einzelne Candidate Revision andernfalls `importable` erschiene.

### DEC-5761-017 – Providerkonto-Identität bei Multi-Broker und Reconnect

| Feld | Wert |
|---|---|
| Status | `DESIGN_ACCEPTED`; Provideridentity-/Collision-/Recoveryevidenz folgt G1/G5/G6 |
| Owner | A2 |
| Reviewer | A4, A5, A3 |

**Entscheidungsvorschlag**

Ein Providerkonto ist nicht identisch mit einem frei änderbaren Account-Label
und nicht automatisch identisch mit einer Connection. Connection und
Providerkonto werden deshalb über eine zeitlich nachvollziehbare
Assoziationsrelation verbunden; ein Konto kann nacheinander oder, falls der
Provider dies belegt, gleichzeitig von mehreren Connections erreicht werden.
Eine Connection kann bei Brokern mit Subkontofähigkeit mehrere Providerkonten
adressieren. Wenn der Provider eine stabile read-only Konto-/Subkontoidentität
liefert, wird daraus serverseitig ein datenschutzminimierter,
providergebundener Account-Key über einen gekeyten HMAC und eine versionierte
Key-ID abgeleitet. Ein einfacher Hash genügt für niedrig-entropische
Kontoidentitäten nicht. Die rohe Providerkonto-ID wird nicht unnötig an den
Browser gegeben.

Eine HMAC-Key-Rotation darf ein bestehendes Providerkonto nicht in zwei
wirtschaftliche Accounts aufspalten. Alte und neue versionierte Digests werden
deshalb über eine serverseitige Identity-Alias-Relation demselben Account
zugeordnet, bevor die alte Version ausläuft.

Liefert ein Provider keine belastbare Kontoidentität, bleibt der Account-Scope
connectiongebunden. Zwei Connections werden dann nicht automatisch
zusammengeführt; ein Reconnect erfordert eine explizite, geprüfte Zuordnung.

Jede neue Connection erhält zunächst einen eigenen `provisional_account_scope`.
Eine Zuordnungsentscheidung ist serverseitig, unveränderlich versioniert,
atomar und auditierbar; der Nutzer bestätigt einen Snapshot ohne Vorauswahl.
Sie enthält mindestens Nutzer, Provider, Umgebung, beide Connection-/Account-
Scopes, Evidenzklasse, Evidence-Digest, Counts/Collisionbefund, Entscheider,
Zeitpunkt und Decision-Version. Provider und Umgebung müssen exakt gleich sein.

Zulässige Evidenzklassen sind geschlossen:

| Evidenzklasse | Wirkung |
|---|---|
| `provider_verified_identity` | wirtschaftliche Account-Aliaszuordnung nur bei identischer, providerbelegter stabiler Konto-/Subkontoidentität |
| `cryptographic_identity_rotation` | wirtschaftliche Aliaszuordnung nur zwischen alten/neuen HMAC-Versionen derselben bereits belegten Provideridentität |
| `user_attested_display_link` | ausschließlich gemeinsame Anzeige; keine wirtschaftliche Scope-, Dedupe-, Candidate-, Approval- oder Importkey-Zusammenführung |
| `conflicting_or_insufficient` | vollständig blockiert |

Vor einer wirtschaftlichen Aliaszuordnung sperrt ein Preflight beide Scopes und
prüft mindestens Provider/Umgebung, Provideridentity-/HMAC-Alias, Raw-Event-
Identity plus Content-Digests, normalisierte Source Keys, Candidate Input-
Digests, wirtschaftliche Importkeys sowie importierte/revertierte Counts. Eine
identische externe ID mit abweichendem Payload-/Source-/Scope-Digest,
widersprüchliche Provideridentität, Importkeykollision oder nicht vollständig
erklärbare Überlappung erzeugt `identity_collision` und verhindert die
Zuordnung.

Eine akzeptierte Zuordnung schreibt bestehende Raw Events, Candidate Revisions,
Approvals, Provenienz oder wirtschaftliche Importkeys niemals still um. Eine
versionierte Account-Aliasrelation macht äquivalente Scopes für zukünftige
Lookups und Dedupeprüfungen sichtbar; vorhandene Identitäten bleiben
unveränderlich auditierbar. Ohne providerbelegte Identitätsäquivalenz bleibt
auch eine ausdrückliche Nutzerattestierung auf `user_attested_display_link`
begrenzt. Sie darf keine zwei Kontohistorien wirtschaftlich mischen.

Mappingentscheidung, Alias, Preflightresultat und Auditereignis committen in
einer Transaktion; jeder Fehler rollt alles zurück. Nach Commit wird ein Mapping
nicht in-place geändert oder gelöscht. Eine Korrektur erzeugt eine neue
versionierte, superseding Entscheidung nach demselben Preflight, sperrt bis zum
Abschluss alle betroffenen zukünftigen Imports und erhält die alte Entscheidung
für den Auditpfad. Bereits vermischte wirtschaftliche Quellen werden niemals
automatisch „zurückgerechnet“; ein solcher Collisionbefund erfordert einen
eigenen fail-closed Recoveryplan und bleibt bis dahin importgesperrt.

Wirtschaftliche Importkeys enthalten mindestens Provider, Providerkonto-Scope,
Instrument/Lifecycle und stabile externe Identität. Identische Broker-IDs
verschiedener Nutzer, Provider oder Konten dürfen niemals kollidieren.

### DEC-5761-018 – Providergebuchte Finanzwerte und optionale lokale Valuation

| Feld | Wert |
|---|---|
| Status | `DESIGN_ACCEPTED – A5 OWNER SIGN-OFF, A2 PROMOTION 2026-08-05`; A3/A4/A5-Gesamtrouting bis v14 PASS, Provider-/Implementierungsevidenz folgt G2/G3/G5 |
| Owner | A5 |
| Reviewer | A2, A3, A4 |

**Entscheidung**

v57.61.0 benötigt für den prospektiven Journalimport keine rückwirkend
erfundene lokale PnL-Formel. Zwei Authority-Modi bleiben strikt getrennt:

1. `provider_booked`: Brokergebuchte atomare oder positionsbezogene Realized-
   PnL-, Fee- und Fundingwerte werden verlustfrei mit Providerfeld,
   Rohvorzeichen, Währung, Source Grain und Provenienz übernommen. Dieser Modus
   ist der einzige für MEXC v57.61.0 importfähige Finanzmodus.
2. `local_valuation`: Equora berechnet wirtschaftliche Werte selbst. Dieser
   Modus bleibt für MEXC `unsupported`, bis Contractklasse,
   Multiplier-Einheit, historische Gültigkeit, Formel- und Rundungsversion sowie
   Golden Fixtures separat belegt sind.

Contractmenge und Preis werden im nativen Providergrain gespeichert.
`base_quantity` ist nur ein optionaler Vergleichswert, wenn eine zum
Ereigniszeitpunkt belegte Metadatenevidenz Contracttyp, Contract Size und
Einheit trägt. Fehlen ausschließlich Contract Size oder Multiplier-Einheit,
während Contractfamilie, Instrumentidentität und Settlement am Ereigniszeitpunkt
separat autoritativ belegt sind, bleibt nur die Basismenge `not_comparable`; ein
ansonsten vollständig providergebuchter Candidate wird nicht allein deshalb
blockiert. Fehlt dagegen die eventzeitliche Contract-/Settlement-Authority,
greift der nachstehende harte Eligibility-Blocker.

Der importfähige MEXC-v57.61.0-Contractscope wird auf lineare
stablecoin-margined Futures begrenzt, deren `contract_family_at_event`,
`settlement_asset_at_event` und `instrument_identity_at_event` für den
wirtschaftlichen Ereigniszeitpunkt autoritativ belegt sind und Settlement
`USDT` oder `USDC` ergeben. Zulässige Authority-Evidenz ist ausschließlich eine
ereigniseingebettete Klassifikation, Provider-Metadaten mit belegter Valid-Time-/
Versionssemantik oder eine versionierte offizielle Regel, die die
Instrumentidentität unveränderlich an Contractfamilie und Settlement bindet.
`authority_evidence_type` und `authority_evidence_version` werden persistiert.
Fehlt dieser Nachweis, gilt `contract_classification = unverified` und
`import_eligibility = blocked`, auch bei ansonsten providergebuchten Werten.
MEXC bietet nach aktueller offizieller Dokumentation zusätzlich Coin-M-Futures;
inverse, Coin-M-, Quanto-, USD1-M- und unbekannte Contractklassen bleiben für
den Journalimport `unsupported`. Raw Capture darf sie typisiert blockiert
sichtbar machen. Auch im USDT-/USDC-Scope ist `settleCoin` nur Contractkontext,
kein stiller Ersatz für fehlende PnL-, Fee- oder Fundingwährung.

Aktuelle Contract-Metadaten werden niemals rückwirkend als historische
Wahrheit angewendet. Zwei fachlich identische Beobachtungen vor und nach einem
Ereignis erzeugen nur `non_authoritative_same_bracket`, niemals einen historischen
Valid-Time-Nachweis; ein zwischenzeitlicher Wechsel und Rückwechsel bleibt
möglich. Ohne providerseitige Gültigkeitszeit, Version oder ereigniseingebettete
Metadaten bleiben Basismenge, lokale Average-/Value-Basen und lokale
Vergleichsrechnung `not_comparable`. Dieselbe Einschränkung blockiert zusätzlich
die importkritische Contractklassifikation und Settlementzuordnung, solange
keine der vorstehend zugelassenen eventzeitlichen Authority-Evidenzen vorliegt.

Die At-Event-Werte liegen in einer immutable `EVENT_CONTRACT_AUTHORITY` pro
konkretem Economic Event, nicht auf einer wiederverwendbaren aktuellen Metadata
Observation. Sie bindet Event-ID/-zeit, Account/Instrument, Authority-Typ/-
Version und providerbelegtes Valid-Time-Intervall oder exakten Immutable-Rule-
Scope. Constraints verbieten Nutzung außerhalb dieses Scopes;
`non_authoritative_same_bracket` ist nicht autoritativ. Candidate- und Approval-Digests
binden das vollständige sortierte Authority-Evidence-Set aller enthaltenen
Events.

Jede konkrete MEXC-Feldzuordnung beginnt `unverified`. Die Authority-Matrix
führt je Komponente mindestens Source Grain, JSON-Feld, Rohvorzeichen,
kanonischen Equity-Effekt, Währung, Coverage, Linkage und Evidenzstatus. Erst
G2/G3-Fixtures plus Providerbeleg dürfen eine Zuordnung auf
`provider_booked_authoritative` promovieren. Execution-`profit`, Execution-
`fee`, Positionsaggregate und Funding sind bis dahin `unverified` oder
`reference_only`; Aggregate dürfen atomare Komponenten niemals ersetzen oder
duplizieren. Fehlende PnL-Währung ist ebenso blockierend wie fehlende Fee- oder
Fundingwährung.

Trading Fee, Realized PnL und Funding bleiben getrennte Financial Components.
Die Supportaussage „Fees are settled in USDT“ darf nur als eingegrenzte
Supportevidenz behandelt werden und ersetzt niemals das beobachtete
`feeCurrency`-Feld. Funding erhält keinen stillen USDT-Default. Fehlen
Fundingwährung, Vorzeichensemantik oder eindeutige Cycle-Zuordnung, bleibt das
Funding unallokiert; der betroffene Netto-PnL ist `not_comparable` und der
Candidate nicht approvable, bis eine autoritative Quelle die Lücke schließt.
Eine leere Fundingantwort ist kein Beleg für null Funding. Schneidet ein Cycle
einen erwartbaren Funding-Settlementzeitpunkt, muss entweder eine gebuchte
Fundingquelle oder eine autoritative Null-/Vollständigkeitsevidenz vorliegen;
andernfalls bleiben Netto-PnL und Approval blockiert. Ein öffentlicher Funding-
Zeitplan darf nur die Erwartung auslösen, niemals einen Buchungswert erzeugen.

Jeder nach einer providerbelegten, versionierten Grenzregel potenzielle Funding-
Settlementzeitpunkt eines Cycles erhält eigene
`FUNDING_SETTLEMENT_EXPECTATION_EVIDENCE`. Sie bindet Candidate, Account,
Instrument, Mode/Side, Lifecycle, Cyclegrenzen, Settlementzeit, Boundary-/
Schedule-/Rule-Version und Funding-Capability-Coverage. Zustände sind
`booked_event_resolved`, `authoritative_zero_resolved`,
`expectation_not_applicable`, `expectation_unverified`, `missing_booking` oder
`ambiguous_attribution`. `expectation_not_applicable` erfordert eine
autoritative Regel, die keinen Settlementzeitpunkt im Cycle belegt; eine leere
Fundingpage genügt nie. Ohne belastbares Expectation-Oracle gilt
`expectation_unverified`. Nur vollständig aufgelöste Erwartungen mit geklärter
Currency und Attribution können Eligibility unterstützen; alle übrigen Zustände
blockieren Candidate, Auswahl, Approval und Import.

Jede PnL-, Fee- und Fundingkomponente persistiert komponentenspezifisch
`currency_value | currency_unknown`, `currency_source`,
`currency_rule_version` und `currency_authority_status`. Für Execution-`profit`
ohne eigenes Provider-Currencyfeld ist eine versionierte, am Ereigniszeitpunkt
autoritative Contract-/Buchungsregel erforderlich. `currency_unknown` oder
fehlende Authority blockiert den Candidate; `settleCoin`, Symbolsuffix und der
Supportclaim „Fees are settled in USDT“ dürfen keine Buchungswährung still
erzeugen.

Orderaggregate, aktuelle Fee-Konfiguration, öffentliche Fundingrate und lokale
Formeln dürfen niemals dieselbe gebuchte Komponente duplizieren. Jede
Providerquelle wird über die Summeninvarianten aus DEC-5761-020 genau einmal
allokiert.

**G0-Akzeptanzkriterien**

- MEXC v57.61.0 exponiert keinen importfähigen `local_valuation`-Pfad.
- Native Contractmenge, optionale Basismenge und jede Finanzkomponente besitzen
  getrennte Evidenz-/Vergleichbarkeitszustände.
- Providergebuchte Werte werden nicht aus aktuellen Metadaten neu berechnet
  oder überschrieben.
- Jede MEXC-Authority-Zuordnung bleibt bis komponentengenauem G2/G3-Beleg
  `unverified`/`reference_only`; kein Dokumentationsbeispiel promoviert sie.
- Fehlende Fundingwährung/-zuordnung blockiert Netto-PnL und Approval; kein
  Symbolsuffix oder Settlement-Coin dient still als Default.
- Jede At-Event-Contract-/Settlement-/Identity-Authority ist an konkrete Event-
  ID/-zeit und Valid-Time-/Immutable-Rule-Scope gebunden; aktuelle und
  `non_authoritative_same_bracket`-Metadaten sind nicht autoritativ.
- Jeder potenzielle Funding-Settlementzeitpunkt ist als gebuchtes Event,
  autoritative Null oder autoritativ nicht anwendbar aufgelöst; leere Page,
  fehlender Oracle, fehlende Currency oder Ambiguität blockiert.
- G2/G3 belegen mit Fixtures mindestens Provider-PnL, positive/negative Fees,
  Fundingbelastung/-gutschrift/-Null, beide Cyclegrenzen, leere Fundingpage,
  fehlenden Expectation-Oracle, Reversal, Partial Fill, aktuelle/
  `non_authoritative_same_bracket`-/A→B→A-Metadaten, gültige Immutable Rule und fehlende
  Currency/Linkage.

### DEC-5761-019 – Brokerzugriff ausschließlich lesend

| Feld | Wert |
|---|---|
| Status | `ACCEPTED` |
| Owner | A4 |
| Reviewer | A2, A3, A6 |
| Nutzerentscheidung | Am 2026-08-04 ausdrücklich bestätigt: Das Journal darf niemals Trades oder Orders beim Broker eröffnen können. |

**Entscheidung**

Equora ist gegenüber jedem Broker ausschließlich ein lesender Datenkonsument.
Das Lesen historischer Orders, Executions, Positionen, Funding- und
Gebührendaten ist erlaubt. Brokerseitig sind ausnahmslos verboten:

- Order eröffnen, platzieren, ändern oder stornieren;
- Position eröffnen, schließen, reduzieren, erhöhen oder reversen;
- Stop-Loss, Take-Profit, Trailing-, Plan- oder sonstige Orders verändern;
- Hebel, Margin Mode, Position Mode oder Kontokonfiguration verändern;
- interne oder externe Transfers, Einzahlungen oder Auszahlungen auslösen;
- irgendeine andere Brokerressource mutieren.

Ein nach Human Approval erzeugter „Journal-Trade“ ist ausschließlich ein
lokaler Equora-Datensatz. Er ist weder eine Brokerorder noch eine Anweisung an
den Broker.

**Technische Invarianten**

- Das providerneutrale Adapterinterface enthält keine Schreiboperation.
- Broker-HTTP ist ausschließlich über explizit versionierte, nachweislich
  nichtmutierende Read-Capabilities möglich; der Adapter nimmt weder freie
  HTTP-Methoden noch freie URLs an. Für MEXC v57.61.0 ist die Methode intern
  unveränderlich `GET`.
- Redirects werden nicht automatisch verfolgt. Ein Redirect ist ein
  Contractfehler, bis Zielhost und Pfad ausdrücklich geprüft wurden.
- Jede fachliche Brokerzustandsmutation ist methodenunabhängig verboten. Für
  MEXC v57.61.0 sind `POST`, `PUT`, `PATCH` und `DELETE` zusätzlich vollständig
  gesperrt. Ein späterer Broker mit technisch anders implementierter, aber
  nachweislich rein lesender Abfrage wäre zunächst `unsupported` und benötigte
  einen separaten konstanten Providervertrag sowie ein neues Security-/QA-
  Gate; es gibt keine konfigurierbare Methodenausnahme.
- Order-Placing-, Trading-, Transfer- und Withdrawal-Pfade werden nicht nur aus
  der Allowlist weggelassen, sondern als Forbidden Capabilities negativ
  getestet.
- Auch WebSocket- oder SDK-Integrationen dürfen keine Trading-/Orderkanäle
  abonnieren oder Nachrichten senden.
- Der Nutzer muss den Brokerkey ohne Trading-, Transfer- und
  Auszahlungsrechte anlegen und dies bestätigen. Ein erfolgreicher Lesetest
  beweist trotzdem nur Lesbarkeit der getesteten Endpoints, nicht die
  vollständige Rechtekonfiguration des Keys.
- Ein überprivilegierter Key bleibt ein Restrisiko bei Serverkompromittierung.
  Code-Allowlist und Nutzerbestätigung ersetzen deshalb nicht die
  providerseitige Deaktivierung aller Schreibrechte und, soweit verfügbar,
  eine IP-Bindung.

**Produktgrenze**

Diese Entscheidung gilt auch für alle späteren Broker. Tradingfunktionalität
ist kein Equora-Journal-Scope und wird in diese Produktlinie nicht eingebaut.
Eine spätere Freigabeoption für Broker-Schreibzugriff existiert nicht.

**Akzeptanzkriterien**

- Statischer Quellscan findet im Brokertransport keine schreibende Methode und
  keinen schreibenden Endpoint.
- Unit-/Contract-Tests lehnen für MEXC jede andere Methode als `GET`, jeden
  unbekannten Host/Pfad, Redirects und dynamische URLs vor Credentialzugriff
  ab.
- Adaptertypen exponieren nur lesende, fachlich benannte Operationen wie
  `fetchHistoricalOrders`; kein generisches `request(method, url)`.
- Mock-Provider weist nach, dass selbst ein Credential mit simulierten
  Zusatzrechten ausschließlich Allowlist-GETs auslösen kann.
- UI und persistierte Flags unterscheiden Lesetest und Nutzerbestätigung und
  behaupten keine technische Gesamtverifikation der Key-Rechte.

### DEC-5761-020 – Typisierte Kandidatenquellen und Finanzautorität

| Feld | Wert |
|---|---|
| Status | `DESIGN_ACCEPTED`; Implementierungs-/Constraint-/Fixture-Evidenz folgt G2/G3/G5 |
| Owner | A2 |
| Reviewer | A5, A3, A4 |

**Entscheidungsvorschlag**

Executionmengen, Fundingbuchungen, Positionsbelege und Finanzkomponenten werden
nicht über eine gemeinsame, executionpflichtige Allocation abstrahiert.
Stattdessen verwendet der Kern getrennte typisierte Relationen:

- Execution Allocation für Entry, Exit und Reversalmengen;
- Funding Allocation für konkrete kontobezogene Funding Events;
- Position Evidence für Cycle-Grenzen, Mode und Provider-Reconciliation;
- Order Evidence für typisierte Aggregate-/Kontextreferences;
- Metadata Evidence für Contract-/Valuationinputs;
- Account Financial Allocation für atomare Fee-Rebate-/sonstige
  Kontobuchungen, sofern ein Provider diesen Grain belegt;
- Financial Component plus typisierte Source Links auf diese Candidate-
  Relationen für genau eine Authority Rule, summenerhaltende Provideranteile
  und optionale Reconciliation References.

Ein typisierter Source Link referenziert über zusammengesetzte Foreign Keys
genau eine Candidate Execution/Funding/Account Allocation oder Order/Position/
Metadata Evidence derselben Candidate Revision. Ein XOR-Constraint verbietet
Nullquelle und Mehrfachquelle. Provideratomare Source-Teilbeträge sind über alle
aktuellen Candidates summenerhaltend; andere Links sind
`calculation_input`, `reference_only`, `overlap` oder `excluded`.

**Fail-closed-Regeln**

- Funding ohne stabile Position-/Side-Zuordnung wird bei überlappenden
  Hedge-Cycles nicht anhand von Symbol und Zeit geraten.
- Positionsevidenz für `boundary_complete` referenziert konkrete versionierte
  Position Revisions.
- Jede in die Kandidatensumme eingehende Komponente ist bis zum normalisierten
  Grain und Raw Event rückverfolgbar.
- Dieselbe Execution-Fee/-PnL-, Funding- oder Accountbuchungsquelle kann nicht
  in mehreren aktuellen Candidates vollständig gebucht werden; Splitbeträge
  müssen Sourcebetrag und Currency exakt erhalten.
- Öffentliche Fundingraten sind Referenzdaten und niemals Kontobuchungen.

### DEC-5761-021 – Paginationordnung ist keine wirtschaftliche Reihenfolge

| Feld | Wert |
|---|---|
| Status | `DESIGN_ACCEPTED`; Providersequenz nicht belegt, Importeligibility fail-closed begrenzt |
| Owner | A2 |
| Reviewer | A5, A3 |

**Entscheidbarer Rahmen**

Eine stabile Provider-ID darf als technischer Pagination-Tie-Breaker dienen,
wenn Stabilität und Eindeutigkeit belegt sind. Sie bestimmt jedoch keine
wirtschaftliche Ereignisreihenfolge, solange der Provider keine monotone
Sequenzsemantik dokumentiert oder ein separat freigegebener Contract-Probe sie
belastbar bestätigt.

Events mit identischem belegten Zeitwert werden als Sequenzgruppe verarbeitet.
Erzeugen zulässige Permutationen verschiedene Inventory-, Cycle-, Reversal-
oder PnL-Ergebnisse, bleibt der Kandidat `ambiguous_sequence`. Nur
providerbelegte Sequence-, Position-, Order- oder Statusevidenz darf die Gruppe
auflösen; die Regel und Vertragsversion werden gespeichert.

Der Kern enumeriert keine unbeschränkt vielen Permutationen. Ohne belegte
Providersequenz ist nur eine versionierte analytische Invarianzprüfung innerhalb
harter Group-/CPU-/State-Budgets zulässig. Kann sie Reihenfolgeunabhängigkeit
nicht beweisen, wird sofort blockiert; Timeout oder Budgetende fällt niemals auf
ID-Sortierung zurück.

**Akzeptanzkriterien**

- Fixture-Paare führen alle relevanten Permutationen einer Same-Timestamp-
  Gruppe aus.
- Identische fachliche Resultate dürfen deterministisch kanonisiert werden;
  abweichende Resultate bleiben blockiert.
- Eine lexikografische oder numerische ID-Sortierung hebt den Blocker ohne
  belegte Sequenzsemantik nicht auf.
- Eine übergroße/komplexe Sequenzgruppe überschreitet kontrolliert das Budget
  und wird deterministisch `ambiguous_sequence`.

### DEC-5761-022 – Versionierte domain-separated Digests

| Feld | Wert |
|---|---|
| Status | `DESIGN_ACCEPTED`; Golden-Vector-/Runtime-Evidenz folgt G1/G5 |
| Owner | A2 |
| Reviewer | A3, A4, A5 |

**Entscheidungsvorschlag**

Scope-, Page-, Raw-, Normalized-, Candidate-, Approval-, Allocation- und
Importdigests folgen einem einzigen versionierten Kanonisierungsvertrag, aber
verwenden getrennte Domains und explizite Feldgrenzen. Version 1 verwendet
SHA-256 über Domain-/Versionspräfix plus die normative typisierte
`equora-tcj-v1`-UTF-8-Bytegrammatik. Personenbeziehbare niedrig-entropische
Kontoidentitäten und Erasure-Tombstones verwenden stattdessen zweckgebundenes
HMAC-SHA-256 mit Key-Version. Die einzigen zulässigen Purpose-IDs sind
`broker_account_identity_v1` und
`broker_erasure_reimport_tombstone_v1`; freie Runtime-Purposes sind verboten.
Jeder Purpose ist konstant an einen eigenen Keyring mit getrenntem Keymaterial,
Versionsraum, Rotation, Retention und Deaktivierung gebunden. Bei gemeinsamer
KMS/HSM-Wurzel müssen unveränderliche, purpose-spezifische HKDF-SHA-256-Contexts
kryptografisch getrennte Subkeys erzeugen. Credential-Verschlüsselungs-Master-
Keys oder Credential-DEKs dürfen niemals wiederverwendet oder in diese
Ableitung einbezogen werden.

Raw-Response-Bytehash und semantischer Eventhash bleiben getrennt. Clientwerte
sind nicht autoritativ; Approval und Import rekonstruieren den erwarteten
Digest serverseitig aus gesperrten Datensätzen. Digestversionswechsel sind
additiv und dürfen bestehende Approvals nicht still neu interpretieren.

**Akzeptanzkriterien**

- Logical ERD definiert Unicode-, Schlüssel-, Array-, Null-, Decimal-, Zeit-
  und Enumkanonisierung, bytegenaue Tags/Escapes, Duplicate-Key-/Limitregeln,
  Raw-Body-Grenze sowie Feldinklusion/-ausschluss je Domain.
- Golden Vectors erzeugen in Node/TypeScript und Postgres identische
  kanonische Bytes und Hexdigests.
- Negative Golden Vectors lehnen freie oder unbekannte Purposes, Cross-Purpose-
  Keyversionen, falsche Keyrings und Credential-Key-Wiederverwendung ab; die
  Rotation beziehungsweise Deaktivierung eines Purpose-Keyrings beeinflusst
  den anderen nicht.
- Relevante Fachänderungen ändern den Digest; volatile Worker-/Fetchmetadaten
  ändern Candidate Snapshot und Approval nicht.
- Unversionierte Stringkonkatenation und Cross-Domain-Wiederverwendung sind
  verboten.

### DEC-5761-023 – Probe-Autorisierung und kumulatives Requestbudget

| Feld | Wert |
|---|---|
| Status | `DESIGN_ACCEPTED`; Discovery-Incident dokumentiert, A3/A4-Korrekturdesign PASS; technische Enforcement folgt G1 |
| Owner | A1 |
| Reviewer | A3, A4 |

**Entscheidung und Incidentbefund**

Jeder Brokerprobe ist eine eigenständige, vor Ausführung versionierte Work Unit
mit Zweck, exakten Capabilities, Queryprofil, abhängigen Vorbedingungen,
kumulativem externem Requestbudget, Credential-/Cleanupplan und ausdrücklicher
Nutzerfreigabe. Jeder tatsächlich abgesendete externe Request zählt gegen das
Budget, auch öffentliche Diagnosecalls, abgebrochene Versuche und Retries. Ein
lokaler Fehler setzt das Budget nicht zurück. Das Bereitstellen eines neuen
Credentialartefakts ist keine Freigabe. Nach einem bereits abgesendeten Request
benötigt jeder Retry vor dem nächsten externen Call eine neue ausdrückliche,
scope- und budgetspezifische Nutzerfreigabe.

Beim erweiterten Discovery-Probe vom 2026-08-04 wich A1 hiervon ab. Der erste
Versuch verbrauchte einen öffentlichen GET aus dem genehmigten Maximum von
sieben. Danach führte A1 ohne neue ausdrückliche Retryfreigabe sieben weitere
GETs aus; kumulativ waren es acht. Der accountweite Orders-Request und Orders
Page 2 entsprachen zwar dem vorab beschriebenen einmaligen Discovery-Ablauf,
waren aber nicht vor Ausführung als separates versioniertes Profil gegenüber
den strengeren Provider-Contract-Regeln §5.7.5/§10.2 dokumentiert. Das ist eine
Governance-/Protokollabweichung und wird als `BRI-031` geführt; sie wird nicht
rückwirkend als vertragskonform oder separat autorisiert dargestellt.

Alle acht beobachteten Calls blieben GET-only. Der abgebrochene erste Versuch
sendete keine Credentialheader und keinen privaten Request; im erfolgreichen
Retry war keine Mutationsmethode registriert. Damit ist kein Broker-
Mutationsereignis belegt. Das reduziert die technische Auswirkung, beseitigt
aber nicht die Governanceabweichung.

**Akzeptanzkriterien**

- Kein weiterer Brokerprobe erfolgt unter der bisherigen Freigabe; aktuell ist
  keiner autorisiert.
- Jeder künftige Plan liegt vor Ausführung versioniert vor und trennt
  Discovery-, Fixture- und späteres Importqueryprofil.
- Runner zählen Requests fail-closed über alle Versuche der Work Unit und
  prüfen jede abhängige Vorbedingung vor Credentialzugriff und Request.
- Budgeterschöpfung, lokale Fehler nach einem Request oder Profilabweichung
  stoppen ohne automatischen Retry; eine neue Nutzerfreigabe ist erforderlich.
- A3/A4 prüfen Incidentdarstellung und Designkorrektur unabhängig; technische
  Negativ- und Budgettests folgen frühestens nach bestandenem G0 in G1.

### DEC-5761-024 – Providerbeobachtete Best-effort-Coverage

| Feld | Wert |
|---|---|
| Status | `ACCEPTED – USER POLICY APPROVED 2026-08-05`; A3/A4/A5/A6-Gesamtrouting bis v14 PASS, technische Folgegate-Evidenz bleibt getrennt |
| Owner | A6 |
| Reviewer | A2, A3, A4, A5 |

**Entscheidung**

Für MEXC v57.61.0 gilt `coverage_policy = provider_observed_best_effort`.
Equora darf nach späterer expliziter Connection-/Scheduleraktivierung
automatisch lesend Raw Events erfassen, lokal speichern, normalisieren und
reconciliieren. Ein endgültiger lokaler Journal-Trade entsteht weiterhin nur
nach expliziter Einzel- oder Sammelauswahl und einer davon getrennten
single-use Human-Approval-Bestätigung. Es gibt keinen automatischen finalen
Journalimport und keinerlei Brokerwirkung.

Ein API-Candidate darf nur dann `reviewable`/`importable` werden, wenn der
vollständige serverseitige Eligibility Predicate aus DEC-5761-009/016 erfüllt
ist und jede importierte Finanzkomponente die später G2/G3-belegte
`provider_booked`-Authority besitzt. `observed_stable` allein genügt nie.

Unveränderlich gebunden und sichtbar bleiben mindestens:

- `coverage_basis = provider_observed`;
- `coverage_policy = provider_observed_best_effort`;
- `export_verification_status = not_export_verified`;
- `silent_omission_risk = provider_may_omit_complete_matched_cycle`;
- Contract-/Profil-/Algorithmusversion sowie abhängige Scope-, Lane-, Gap- und
  Authoritydigests.

Die Approval-Ansicht bezeichnet solche Kandidaten als „Importierbar –
providerbeobachtet, nicht exportverifiziert“ und erklärt, dass eine konsistente
Provideromission eines gesamten matched Cycles über die API unentdeckt bleiben
kann. Bekannte Gaps, Partial-/Failed-/Unverified-Scopes, Carry-in, ungeklärte
Fundingerwartung, fehlende Currency oder unbelegte Authority bleiben hingegen
harte Blocker und sind kein akzeptiertes Best-effort-Risiko.

Nach Approval sind diese Journal-Trades regulär lokal nutzbar. Auswertungen
dürfen Best-effort- und später exportverifizierte Trades gemeinsam berechnen,
aber niemals still vermischen: Coverage-Zusammensetzung, Counts und Filter
müssen sichtbar sein. Weder Accountvollständigkeit noch steuerliche
Vollständigkeit oder Providerretention darf aus Best-effort-Daten behauptet
werden. Eine spätere Export-Reconciliation kann eine neue unveränderliche
Revision mit `export_verification_status = export_verified` erzeugen; sie
überschreibt die ursprüngliche Provenienz nicht still.

**Akzeptanzkriterien**

- Automatische Erfassung/Speicherung und finaler Journalimport bleiben getrennte
  Capabilities und Berechtigungen.
- Keine Vorauswahl; explizite Sammelauswahl und separate Bestätigung bleiben
  notwendig.
- Coverage-/Omissionhinweis ist Candidate-, Approval-, Trade- und
  Statistikbestandteil und wird bei Änderung snapshotinvalidierend.
- Bekannte Daten- oder Finanzintegritätslücken bleiben trotz Best-effort-Policy
  blockierend.
- Best-effort und Export-Verified sind filterbar, zählen getrennt und können
  nicht denselben Trade still doppelt importieren.

## 4. Multi-Broker-Onboardingvertrag

Ein späterer Brokeradapter benötigt vor Implementierung:

1. Offiziellen Providervertrag mit Datum und Version.
2. Capability-Matrix für Orders, Executions, Positionen, Funding,
   Contract-/Instrumentmetadaten, Gebühren und Rechteprüfung.
3. Eigene anonymisierte/synthetische Fixtures und Golden Cases.
4. Abbildung der Provider-Grains auf die kanonischen Kern-Grains.
5. Fehler-, Pagination-, Retention-, Rate-Limit- und Late-Arrival-Vertrag.
6. Security-/Privacy-Review für Credentials, Scopes, Logs, Export und Löschung.
7. Nachweis, dass keine Trading-, Transfer- oder Auszahlungsoperationen
   implementiert werden.
8. Unabhängige A3-/A4-/A5-Reviews.

Ein vorhandener MEXC-GO ist kein automatischer GO für einen anderen Broker.

## 5. Offene Freigaben und G0-Wirkung

| Entscheidung | Status | G0-Wirkung |
|---|---|---|
| DEC-5761-006 | Accepted | Multi-Broker-Prämisse erfüllt |
| DEC-5761-007 | Design Accepted | A3/A5 Design PASS; Provider-/Golden-Evidenz folgt G2/G3 |
| DEC-5761-008 | Design Accepted | A3/A5 Design PASS; Provider-/Golden-Evidenz folgt G1–G3 |
| DEC-5761-009 | Design Accepted | Prospektiver Sync und Best-effort-Policy; exklusiver Series-Current-Pointer, parallele Generationswechsel, deterministische Health und Funding-Expectation; A2/A3/A4/A5/A6 PASS, Implementierung G1–G4 |
| DEC-5761-010 | Design Accepted | A3/A4/A5 Design PASS; Provider-/Golden-Evidenz folgt G2/G3 |
| DEC-5761-011 | Design Accepted | A3/A5 Design PASS; konkrete Provider-/Golden-Epsilonevidenz folgt G3 |
| DEC-5761-012 | Design Accepted | A3/A5/A6 Design PASS; Revert-/Statistik-/Tombstone-Evidenz folgt G4–G6 |
| DEC-5761-013 | Design Accepted | Nutzerpolicy vom 2026-08-04 angenommen; externe Rechts-/Datenschutzprüfung vor Pilot/Kundenbetrieb bleibt Pflicht |
| DEC-5761-014 | Design Accepted | A3/A4 Design PASS; Rotation-/Recoveryevidenz folgt G5/G6 |
| DEC-5761-015 | Accepted | Bounded Public-/Private-/Discovery-Probes bestätigen aktuellen Host, vier private Pfade einschließlich `/v3`, Authentisierung sowie Order-/Execution-/Funding-Items; vollständiger Signaturvertrag bleibt G1, Position-/globale Paging-/Retention-/Valuationfragen verbleiben in DEC-5761-009/018 |
| DEC-5761-016 | Accepted | Automatischer Read-Sync ist vom Journalimport getrennt; keine Vorauswahl, aber explizite Sammelauswahl plus getrennte Human-Approval-Bestätigung zulässig |
| DEC-5761-017 | Design Accepted | A3/A4/A5 Design PASS; Provideridentity-/Collision-/Recoveryevidenz folgt G1/G5/G6 |
| DEC-5761-018 | Design Accepted | A5-Owner-Entscheidung und A2/A3/A4/A5 PASS; MEXC nur nach G2/G3-Beleg providergebucht, eventzeitliche Contract-/Settlement-, Currency- und Funding-Expectation-Authority zwingend; lokale Valuation unsupported |
| DEC-5761-019 | Accepted | Brokerzugriff dauerhaft ausschließlich lesend |
| DEC-5761-020 | Design Accepted | A3/A4/A5 Design PASS; Implementierungs-/Constraint-/Fixture-Evidenz folgt G2/G3/G5 |
| DEC-5761-021 | Design Accepted | Ohne belegte Providersequenz nur bounded Invarianzbeweis, sonst `ambiguous_sequence`; Provider-/Fixture-Evidenz folgt G1–G3 |
| DEC-5761-022 | Design Accepted | A3/A4/A5 Design PASS; Golden-Vector-/Runtime-Evidenz folgt G1/G5 |
| DEC-5761-023 | Design Accepted | Acht statt sieben kumulative Discovery-GETs und nicht vorab versioniertes Discovery-Profil als BRI-031 offengelegt; keine Dauerfreigabe; A3/A4-Korrekturdesign PASS, Enforcement G1 |
| DEC-5761-024 | Accepted | Nutzer bestätigt `provider_observed_best_effort`; automatische Read-Capture/Storage bleibt von expliziter Sammelauswahl, Human Approval und lokalem Journalimport getrennt; A2/A3/A4/A5/A6-Gesamtrouting bis v14 PASS |

**Designstatus dieses Artefakts: `v14 DESIGN_ACCEPTED / A3/A4/A5/A6 PASS /
G0 GO – DESIGN ONLY`;
Implementierung und
ausgeführte Testevidenz sind getrennte Folgegate-Dimensionen.**
