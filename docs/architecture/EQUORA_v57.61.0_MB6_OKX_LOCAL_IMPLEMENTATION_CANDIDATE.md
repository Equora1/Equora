# Equora v57.61.0 – MB6 OKX lokaler Implementierungskandidat

## 0. Status und Geltungsgrenze

```text
status = non_production_implementation_candidate
base_main = 766cbea2a6ec95930944f3c279b5dbe77ed8e1fd
provider = okx
provider_contract = okx-swap-read-contract/2026-08-27-mb5.6
global_connected_registry = unchanged_okx_absent
production_runtime = unchanged_off
provider_request_authority = false
credential_action_authority = false
connection_apply_authority = false
capture_import_authority = false
commercial_release_gate = blocked
```

Dieses Dokument ergänzt die unveränderten MB5.6-Vertragsartefakte. Es
supersediert ausschließlich deren damalige Aussage, dass noch kein lokaler
Adapter- oder UI-Kandidat existiert. Es ändert weder den geprüften MB5.6-Hashstand
noch eine externe Autorität.

## 1. Fakten

1. Der lokale Adapterkandidat beschreibt exakt drei signierte `GET`-Capabilities:
   Accountkonfiguration, kontoverfügbare `SWAP`-Instrumente und eine auf zehn
   Records begrenzte Fillseite.
2. Origin, Port, Pfade, Queries, Queryreihenfolge, Responsebytes, Timeout und
   MB5.6-Profil-/Capabilitydigests sind konstant gebunden.
3. Der Adapter ist nicht in `lib/server/broker-code-registry.ts` registriert.
   Die globale Registry liefert für alle OKX-Referenzen weiterhin `null`.
4. Capture, Pagination, Raw-Event-Mapping, Connection-Apply, Credentialpersistenz
   und Import sind im Kandidatenadapter nicht implementiert und blockieren.
5. Die Kandidatenruntime akzeptiert nur `off` oder `synthetic_test`.
   `synthetic_test` wird durch die Konfigurationsauflösung nur unter
   `NODE_ENV=test` zugelassen und am ausführenden Runner nochmals direkt gegen
   `process.env.NODE_ENV` geprüft.
6. Die Runtime besitzt keinen Providertransport-, Fetch-, Signing- oder
   Credentialport. Sie verarbeitet ausschließlich bereits im Testprozess
   vorhandene, als `synthetic_fixture_no_network` markierte Responsebytes. Sie
   besitzt jedoch bewusst ausführbare Abhängigkeiten für eine Trusted Clock und
   eine im E2E lokal implementierte Single-use-Permit-Control-Plane. Diese
   erhält beim Runnerstart ausschließlich Permit 1; Permit 2 und 3 werden erst
   nach der jeweils akzeptierten Vorgängerresponse und nur gegen ihren eigenen
   vorherigen Konsum-/Generationszustand ausgestellt. Die Runtime arbeitet über
   `await`-Grenzen ausschließlich mit eigenen eingefrorenen Authority-, Permit-,
   Receipt- und Response-Snapshots. Daraus darf kein allgemeiner Claim „keine
   ausführbaren Ports“ abgeleitet werden.
7. Die UI fordert für OKX keine Credentials an und bietet keine Setup-, Probe-,
   Apply-, Capture- oder Importaktion. Sie bezeichnet OKX ausdrücklich als
   gesperrten lokalen Kandidaten, nicht als unterstützten Provider.

## 2. Fail-closed-Verträge

Der lokale Kandidat blockiert mindestens:

- andere Methoden, Origins, Ports, Pfade, Queries, Cursor, Seitenzahlen oder
  Responsebudgets;
- nicht eindeutiges JSON einschließlich doppelter Membernamen, ungültiges
  UTF-8, unbekannte Envelopefelder und nicht exakt erfolgreiche Providercodes;
- unbekannte, fehlende oder typfalsche Projektionsfelder;
- andere Permissiontokens als exakt `read_only`;
- leere, doppelte, syntaktisch ungültige, nicht kanonisierbare oder
  authorityfremde IP-Sätze. Für diesen ausschließlich synthetischen Ablauf sind
  nur die nicht routbaren Dokumentationsnetze der Fixtures zulässig. Eine
  allgemeine Public-Routability-Policy ist bewusst nicht implementiert; alle
  anderen Adressen werden an dieser Boundary abgelehnt. Die Fixturepolicy ist
  keine reale Egress-Evidenz;
- abweichende pseudonyme Kontoidentität;
- Instrumente außerhalb `SWAP`, ausgewählte Instrumente außerhalb linearer
  USDT-Contracts sowie Fillreferenzen außerhalb der zuvor akzeptierten
  Instrumentmenge;
- Widersprüche zwischen `account/config.posMode` und Fill-`posSide`;
- Fill-`ts` außerhalb des authoritygebundenen maximalen Sieben-Tage-Fensters
  sowie Fenster außerhalb des zur Trusted Clock gebundenen dokumentierten
  Drei-Monats-Horizonts;
- mehr als drei Requests, mehr als zehn Fills, Parallelität, Retry, Response-
  oder Gesamtbyteüberschreitung, mehr als vier Sekunden je Response oder mehr
  als 15 Sekunden Gesamtdauer;
- Zusatzfelder, Proxies, Accessors, Symbolkeys, Sparse Arrays, ungültige
  Wirebytes, nichtkanonische Zeiten und nicht gebundene Permits/Receipts;
- Permit-Replay, Clock-Rollback sowie fehlende Vorgänger-Response-Evidenz für
  Generation zwei und drei;
- Permit 2/3, deren `issuedAt` vor der akzeptierten Vorgängerresponse liegt oder
  die nicht zusätzlich den beobachteten Provider-/IP-Projektionsdigest und den
  beobachteten pseudonymen Kontoidentitätsdigest binden. Response 1 wird vor
  jeder Ausstellung und Konsumierung von Permit 2 gegen diese Erwartungen
  geprüft;
- Permits, deren geschlossener Claimumfang vom vollständigen MB5.6-Satz
  abweicht. Dies umfasst Connection-/Setup-/Identity-/Attestationclaims,
  erwartete und beobachtete Digests, Authoritygeneration und -snapshot,
  Request-/Capability-/Provider-/Profilclaims, Environment/Origin/Port/Methode,
  Header-/Requestdeskriptordigests einschließlich `capability_id`, Fenster,
  Budgets, Zeiten und Konsumstatus. Der Requestdeskriptordigest wird im Test
  zusätzlich durch ein unabhängiges MB5.6-Orakel reproduziert;
- nichtkanonische oder typfalsche Connection-, Setup-, Identity-, Permit- und
  Receipt-/Transaktionskennungen sowie Mutationen caller-eigener Authority-,
  Permit- oder Responseobjekte nach dem Runtimeeintritt. Jedes lokale
  Konsumreceipt bindet zusätzlich den kanonischen Digest des vollständigen
  konsumierten Permits;
- nichtprimitive SHA-256-Claims ohne Stringkonvertierung, eigene
  `byteLength`-/Symbol-Properties am exakt 32 Byte langen Identity-Key sowie
  zusätzliche oder accessorbasierte Properties einschließlich `bind` an den
  ausführbaren Portfunktionen. Sämtliche skalaren Authorityclaims werden vor
  jeder kanonischen Authoritydigest-Traversierung typ- und formgeprüft; auch ein
  verschachtelter Claim-Proxy wird ohne Ausführung seiner Traps blockiert;
- direkte Response-Helper-Eingaben mit Proxies, Accessors, Symbol-/Zusatzfeldern,
  Sparse-/Nichtbyte-Arrays oder nicht geschlossenen Queryobjekten, bevor eine
  caller-kontrollierte Eigenschaft ausgeführt wird.

Das synthetische Resultat enthält weder UID, IP, Instrument-ID, Providerbody
noch Credentialmaterial. Es setzt Connection-, Persistenz-, Capture-, Import-,
Support-, Production- und kommerzielle Claims ausdrücklich auf `false`.

## 3. Kontrollierter End-to-End-Scope

Der lokale E2E-Pfad lautet:

```text
synthetische MB5.6-Fixtures
  -> initiales geschlossenes Single-use-Permit 1
  -> strikte Wire-/JSON-/Account-/Permission-/IP-/Identityprüfung
  -> zustandsgebundene sequenzielle Ausstellung und Single-use-Konsumierung von Permit 2
  -> strikte Instrumentprüfung und Instrumentauswahl
  -> zustandsgebundene sequenzielle Ausstellung und Single-use-Konsumierung von Permit 3
  -> Fill-/Positionsmodus-/Fensterbindung
  -> minimiertes synthetic_pass-Resultat
```

Der Test stubbelt `fetch` und verlangt null Aufrufe. Er prüft zusätzlich den
globalen Registryausschluss, die doppelte Test-Environment-Grenze, Permit-Replay,
Bootstraptransition, Pre-Issuance, beobachtete Transitiondigests, Clock-Rollback,
Retention, unabhängige Requestdeskriptordigests, geschlossene Record-, Array-
und ausführbare Portdeskriptoren, Proxy-/Accessor-Abweisung, asynchrone
TOCTOU-Mutationen, `bind`-/`byteLength`-/SHA-Coercion-Mutanten sowie
verschachtelte Proxyclaims vor der Authoritydigest-Berechnung,
ausschließlich synthetische Dokumentations-IP-Klassen,
strikte Identifier-Typen, Wirebytes, doppelte JSON-Member, leere Fillseiten,
`long_short_mode`, capabilityübergreifende Instrumentreferenzen,
Sequenzüberlappung sowie die fehlende Capturefähigkeit. Die lokale Control Plane
belegt nur den Zustand innerhalb derselben Testinstanz; sie ist keine dauerhafte
oder workerübergreifend atomare Production-Authority.

Dieser Ablauf ist kein OKX-Probe und keine Aussage über reales
Providerverhalten, Retention, Rate Limits, Egress, Credentials oder
Kontoberechtigungen.

## 4. Aktuell revalidierte öffentliche Providergrenzen

Am 2026-08-27 wurden ausschließlich öffentlich und read-only erneut geprüft:

- `https://www.okx.com/docs-v5/log_en/`;
- `https://www.okx.com/en-eu/help/api-faq-eea`;
- `https://www.okx.com/en-eu/help/okx-api-agreement`.

Der Change Log enthält bis 2026-08-26 keine erkannte Änderung, die den
konkreten Drei-Read-Vertrag automatisch entsperrt. Die EEA-FAQ nennt weiterhin
`eea.okx.com` als regionsabhängigen Host. Der aktuelle API-Vertrag erlaubt die
interne Nutzung am eigenen Konto, blockiert aber ohne ausdrückliche schriftliche
OKX-Autorisierung weiterhin kommerzielle Produkte, SaaS und Drittweitergabe.

Diese Prüfung ist kein unveränderlicher Websnapshot und ersetzt weder die
Nutzerattestierung der tatsächlichen OKX-Entity noch eine schriftliche
kommerzielle Autorisierung.

## 5. Verbleibende harte Gates

Vor jedem echten OKX-Request bleiben mindestens erforderlich:

1. bestätigte Registrierungsdomain, Vertragsentity, Demo-Umgebung und exakt
   gepinnter Host;
2. schriftliche OKX-Autorisierung für den beabsichtigten kommerziellen
   Equora-Scope oder ein späterer eindeutig erlaubender Vertrag;
3. separat erzeugtes Demo-Credential mit ausschließlich Read, gebundenem und
   exakt geprüftem Egress-IP-Satz sowie aktivierter MFA;
4. verschlüsselte ephemeral serverseitige Credentialsession ohne Browser-,
   Log-, Evidence- oder Persistenzleck;
5. dauerhaft atomare Permit-/Authority-/Fence-Control-Plane über alle Worker;
6. zentraler Signing-/Egress-Transport mit Byte-, Kompressions-, Redirect-,
   TLS-, Timeout- und Credential-Zeroization-Review;
7. neue konkrete Nutzerfreigabe für exakt das benannte Probeprofil;
8. erneuter unabhängiger A4-/A5-Review unmittelbar vor dem ersten Request.

Vor einem Productionrelease wären zusätzlich reale, sanitierte
Non-Production-Evidenz, Golden-/Gap-/Retentionbewertung, A3-/A4-/A5-Releasevoten
und ein eigener Human-Approval-Entscheid erforderlich.

## 6. Nicht autorisierte Folgeaktionen

Dieses lokale Delta autorisiert ausdrücklich nicht:

- Staging, Commit, Push, PR, Merge oder Deployment;
- OKX-Key-Anlage, Credentialeingabe oder irgendeinen OKX-Request;
- Supabase-, Production-, Cron-, Capture-, Reconciliation- oder Importaktionen;
- einen Support-, Verfügbarkeits-, Vollständigkeits-, PnL-, Gap-free-,
  Production-ready- oder kommerziellen Nutzungsclaim.
