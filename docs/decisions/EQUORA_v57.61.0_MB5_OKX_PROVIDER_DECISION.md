# Equora v57.61.0 – MB5-Produktentscheidung / OKX als zweiter Providerkandidat

## 0. Entscheidung

| Feld | Entscheidung |
|---|---|
| Phase | `MB5` |
| Provider | `OKX` |
| Providerstatus | lokaler Vertragskandidat; kein gebauter oder registrierter OKX-Broker-Sync/API-Adapter |
| Kontoschnitt | eigenes OKX-Haupt- oder Unterkonto, technisch über `uid`/`mainUid` gebunden |
| Markt | Perpetual Futures (`instType=SWAP`) |
| Erstes Settlementprofil | lineare USDT-Swaps (`settleCcy=USDT`) |
| Regionprofil | EEA-Kandidat; tatsächliche OKX-Registrierungsdomain muss vor jedem Probe technisch und durch Nutzerattestierung gepinnt werden |
| Erstes späteres Probeumfeld | separates OKX-Demokonto; noch nicht autorisiert |
| Transportgrenze | ausschließlich konstante `GET`-Reads über das zentrale Broker-Egress |
| Stand | 2026-08-27, Europe/Berlin |

Diese Entscheidung eröffnet ausschließlich den lokalen MB5-Vertrags- und
Fixture-Scope. Sie registriert keinen Adapter, aktiviert keine Runtime und
autorisiert keinen OKX-Aufruf.

## 1. Fakten

1. Die providerneutrale Equora-Architektur verlangt vor einem zweiten Adapter
   eine getrennte MB5-Produktentscheidung, einen aktuellen Providervertrag,
   ein minimales Probeprofil, synthetische Golden Cases sowie unabhängige
   A3-/A4-/A5-Reviews.
2. Der bestehende Brokerkern erlaubt als Providermethode nur `GET`.
3. OKX dokumentiert für den gewählten Scope getrennte Read-Endpunkte für
   Accountkonfiguration, kontoverfügbare Instrumente, Orderhistorie,
   Ausführungen, Positionshistorie und Bills.
4. `GET /api/v5/account/config` liefert `uid`, `mainUid`, `acctLv` und
   `posMode`. Die Roh-IDs dürfen Equora nicht als UI-, Log- oder
   Evidence-Identifier verlassen; eine installationsgebundene HMAC-Ableitung
   ist erforderlich.
5. Für `SWAP` ist `sz` die Anzahl Kontrakte. OKX dokumentiert den Nennwert
   eines Derivatekontrakts als `ctVal × ctMult` in der Einheit `ctValCcy`.
   Eine Basismenge darf daher erst aus den aktuellen Instrumentmetadaten,
   insbesondere `ctVal`, `ctMult`, `ctValCcy` und `ctType`, abgeleitet werden.
6. Die dokumentierten GET-Historien besitzen begrenzte Horizonte. Drei Monate
   sind keine globale Kontohistorie; unvollständig stornierte Orders können
   laut Dokumentation deutlich kürzer vorgehalten werden.
7. Das langfristige Bill-Archiv benötigt zunächst einen read-semantischen
   `POST`. Dieser Ablauf ist mit dem aktuellen GET-only-Kern nicht vereinbar
   und bleibt außerhalb MB5 v1.
8. `GET /api/v5/account/config` liefert im Feld `perm` die Permissiontokens des
   aktuell anfragenden API-Keys. Der Probe muss mindestens `read_only`
   beobachten und bei `trade`, `withdraw`, leeren oder unbekannten Tokens
   fail-closed blockieren. Das ist eine technische Momentaufnahme der
   Key-Permissions, aber kein Beweis aller sonstigen Accountfähigkeiten.
9. Der aktuelle OKX-API-Vertrag erlaubt interne Nutzung für das eigene Konto,
   beschränkt aber ohne schriftliche OKX-Autorisierung unter anderem
   Kommerzialisierung, SaaS-Angebote und Datenweitergabe an Dritte.
10. Das lokale MB5-Orakel validiert Instrumentresponses als Array: exakte
    Basisprojektion vor dem USDT-/Linear-Filter, vollständige Prüfung aller
    ausgewählten Records und Cross-Capability-Bindung aller ausgewählten
    `instId`. Doppelte JSON-Membernamen werden vor dem semantischen Parse
    fail-closed blockiert.

## 2. Annahmen und offene Nachweise

- Die Zeitzone des Nutzers ist ein Indiz für EEA, aber kein Nachweis der
  OKX-Registrierungsentity. Vor einem späteren Probe müssen Registrierungsdomain,
  Vertragsentity, API-Host und Demo-/Live-Umfeld zusammen bestätigt werden.
- Der erste Produktscope ist ein eigenes Konto. Ein Multi-Tenant-, SaaS- oder
  Drittanbieterbetrieb ist nicht freigegeben.
- USDT-linear ist die erste Contractklasse. USDC-, USD-stablecoin- und
  coin-margined Swaps sind nicht implizit kompatibel.
- Die genaue fachliche Zuordnung aller OKX-Bill-`type`-/`subType`-Werte zu
  Funding, Fee, Transfer oder sonstigem Finanzereignis bleibt bis zu einer
  vollständig gepinnten Enum-Matrix fail-closed.
- Eine dokumentierte Feldbeschreibung ist noch keine reale Providerbeobachtung.
  Providerverhalten, Retention, Pagination und Late Arrivals bleiben bis zu
  einem separat freigegebenen Non-Production-Probe unbeobachtet.

## 3. Bewertung der Kandidatenentscheidung

OKX ist technisch ein sinnvoller zweiter Architekturtest, weil der gewählte
Scope mehrere klar getrennte, authentifizierte GET-Historien, stabile
Provider-IDs und ausdrückliche Instrumentmetadaten besitzt. Er prüft damit die
Providerneutralität gegen andere Grains und Einheiten als MEXC, ohne den Kern
für beliebige Methoden oder Origins zu öffnen.

Die Auswahl ist dennoch kein Release-GO. Zwei Grenzen sind wesentlich:

1. Das Drei-Monats-Fenster erlaubt keinen Claim einer vollständigen
   Kontohistorie.
2. Für einen kommerziellen Equora-Einsatz ist vor MB6/MB7 eine ausdrückliche
   schriftliche OKX-Autorisierung oder ein späterer, neu versionierter
   OKX-Vertrag erforderlich, der die konkrete Nutzung ausdrücklich erlaubt.
   Account- oder Jurisdiktions-Eligibility allein entsperrt dieses Gate nicht.
   Diese Frage kann nicht durch Tests gelöst werden.

## 4. Verbindlicher Scope

MB5 enthält:

- diesen Produktentscheid;
- den versionierten OKX-Providervertrag;
- eine maschinenlesbare Capability- und Probeprofildatei;
- ausschließlich synthetische, anonymisierte Fixtures;
- lokale Contracttests gegen Read-only-, Pin-, Budget-, Response- und
  Datenintegritätsgrenzen;
- hashgebundene lokale Evidenz und unabhängige A3-/A4-/A5-Voten.

MB5 enthält nicht:

- OKX-Adapter-, Registry-, Runtime-, UI-, Datenbank- oder Deploymentcode;
- API-Key-Anlage, Credentialeingabe oder Credentialpersistenz;
- echte öffentliche oder private OKX-Requests;
- WebSockets oder read-semantische `POST`-Abläufe;
- Production, Supabase, Cron, Capture, Reconciliation oder Import;
- einen Claim, dass der verbundene OKX-Broker-Sync/API-Provider in Equora
  verfügbar, gebaut oder unterstützt ist;
- eine Änderung am bereits bestehenden manuellen OKX-Futures-CSV-Import oder
  am Journal-Brokerprofil `okx-perps`; MB5 bewertet ausschließlich den neuen
  verbundenen Broker-Sync/API-Providerpfad.

## 5. Harte Gates für spätere Phasen

Vor MB6 müssen zusätzlich zu einem bestandenen lokalen MB5-Gate mindestens
vorliegen:

1. aktuelle Revalidierung der offiziellen Dokumentation und des Change Logs;
2. bestätigte Registrierungsentity und exakt ein zulässiger regionaler Host;
3. für kommerzielle/SaaS-/Drittanbieternutzung eine ausdrückliche schriftliche
   OKX-Autorisierung oder ein späterer, neu versionierter OKX-Vertrag, der die
   konkrete Nutzung ausdrücklich erlaubt;
4. separat erzeugter Demo-Read-only-Key mit ausschließlich `read_only`,
   technisch geprüftem `perm` und einem providerseitigen `ip`-Satz, der nach
   Kanonisierung exakt dem authority-gepinnten autorisierten Egress-IP-Satz
   entspricht; zusätzliche, fremde oder doppelte IPs blockieren; kein
   Credentialmaterial gelangt an Chat, Git oder Logs;
5. aktivierte MFA am OKX-Konto sowie attestierter Incidentplan für sofortige
   Keyrotation und -widerruf plus OKX-Benachrichtigung bei vermuteter oder
   bestätigter Kompromittierung;
6. neue konkrete Nutzerfreigabe für exakt das benannte Probeprofil;
7. pro Request ein unverbrauchter Single-use-Permit, der Connection,
   Setup-Command/Row-Version, Request/Sequence, Capability-/Profil-/Authority-
   Digests, exakten Requestdescriptor, kanonisches `issued_at`, Deadline, Window
   und Budgets atomar bindet, sowie eine ausschließlich serverseitige
   vertrauenswürdige Runtimeuhr und die technische Egress-Allowlist;
8. ein geschlossenes All-or-nothing-Aggregatorakel für alle drei Requests,
   Responses und Permits einschließlich `ts`-Window, Account-`posMode`,
   Fill-`posSide`, Instrumentreferenz und erwartetem/beobachtetem
   `perm`-/`ip`-Projektionsdigest, erwarteter/beobachteter Accountidentität,
   sequenzieller Authoritygeneration, Vorgänger-Response-Evidenz,
   servergemessenen Responsebytes/-zeitpunkten, Capability-/Gesamtbudget und
   Filllimit zehn;
9. erneuter A4- und A5-Review vor dem ersten Providerrequest.

Vor MB7 beziehungsweise einem Productionrelease sind ein real beobachteter,
sanitisierter Non-Production-Scope, Golden-Abgleich, Gap-/Retentionbewertung,
Release-Evidenz und ein eigener Human-Approval-Entscheid erforderlich.

## 6. Entscheidungsergebnis

```text
MB5_LOCAL_CONTRACT_WORK = GO
OKX_BROKER_SYNC_API_ADAPTER_BUILT = false
OKX_CONNECTED_PROVIDER_REGISTERED = false
OKX_API_READ_PROVIDER_SUPPORTED = false
EXISTING_OKX_CSV_IMPORT_CHANGED = false
OKX_PROBE_AUTHORIZED = false
OKX_ACCOUNT_AND_JURISDICTION_ELIGIBILITY = UNCONFIRMED
OKX_COMMERCIAL_AUTHORIZATION = BLOCKED_PENDING_EXPLICIT_WRITTEN_OKX_AUTHORIZATION_OR_NEW_EXPLICITLY_PERMITTING_VERSIONED_OKX_CONTRACT
OKX_COMMERCIAL_RELEASE = BLOCKED
PRODUCTION_OR_IMPORT_AUTHORITY = false
```

Frühere Freigaben sind Historie. Dieses Dokument autorisiert weder den nächsten
Git-Schritt noch irgendeine externe Aktion.
