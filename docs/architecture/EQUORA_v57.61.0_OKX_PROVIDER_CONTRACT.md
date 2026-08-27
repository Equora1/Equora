# Equora v57.61.0 – MB5 Provider Contract v1 / OKX SWAP

## 0. Dokumentkontrolle

| Feld | Wert |
|---|---|
| Phase | `MB5` |
| Designstatus | lokaler Vertragskandidat; weitere Remediation nach A3-/A5-NO-PASS; erneuter gemeinsamer Review ausstehend |
| Implementierungsstatus | verbundener OKX-Broker-Sync/API-Adapter nicht gebaut, nicht registriert und nicht unterstützt; bestehender manueller OKX-CSV-Import unverändert |
| Provider | `okx` |
| Contract-Version | `okx-swap-read-contract/2026-08-27-mb5.6` |
| Marktprofil | lineare USDT-Perpetual-Futures (`SWAP`) |
| Regionprofil | EEA-Kandidat, vor Probe zwingend zu attestieren und zu pinnen |
| Runtime | unverändert `off` |
| Pflichtreviews | A3, A4, A5 auf identischem Hashstand |
| Autorität | lokale Dokumentation, Fixtures und Tests; keine Provideraktion |

## 1. Vertragsgrenze

Der spätere OKX-Adapter wäre die einzige Schicht, die OKX-Hosts,
Authentifizierungsheader, Pfade, Cursor und Providerfelder kennt. MB5 baut
diesen Adapter noch nicht. Der Vertrag ist fail-closed:

- nur konstante HTTPS-Origin, Port 443, `GET`, Pfadtemplate und Queryschema;
- keine Redirects, dynamischen Hosts, WebSockets oder frei übergebenen URLs;
- kein `POST`, `PUT`, `PATCH` oder `DELETE`, auch wenn OKX die Operation als
  „Read“ klassifiziert;
- Responseerfolg nur bei exakt `code="0"`, leerem `msg` und einem Array in
  `data`; HTTP 2xx allein genügt nicht;
- unbekannte Shapes, Enums, Einheiten, Cursor oder Pflichtfelder blockieren die
  Work Unit und werden nicht zu einem leeren Ergebnis;
- keine Order-, Cancel-, Amend-, Close-, Transfer-, Withdrawal-, Key- oder
  Accountkonfigurationsoperation;
- Provider-IDs, Finanzdaten, Header und Providertexte werden nicht ungefiltert
  in UI, Standardlogs oder Evidence geschrieben.

„Order“ meint ausschließlich einen historischen Brokerdatensatz. Dieser
Vertrag enthält keine Operation, die eine Order erzeugt oder verändert.

## 2. Offizielle Quellen

Die Quellen wurden am 2026-08-26 und die ergänzende Mengen-/PnL-Semantik am
2026-08-27 read-only geprüft. OKX kann Dokumentation,
Produkte, Regionen, Rechte, Retention und Limits ändern; Change Log,
Vertragsentity und Zielregion sind vor MB6 und MB7 neu zu prüfen.

| ID | Offizielle Quelle | Vertragsrelevanz |
|---|---|---|
| OKX-SRC-001 | [OKX API Guide](https://www.okx.com/docs-v5/en/) | REST-Hosts, Authentifizierung, Signatur, Demoheader, Endpunkte, Felder, Pagination, Retention und Limits |
| OKX-SRC-002 | [OKX API Change Log](https://www.okx.com/docs-v5/log_en/) | aktuelle Host-/Schemaänderungen und Revalidierungsquelle |
| OKX-SRC-003 | [OKX Europe API FAQ](https://www.okx.com/en-eu/help/api-faq-eea) | EEA-Host- und Key-Hinweise; regionale Verfügbarkeit bleibt accountabhängig |
| OKX-SRC-004 | [OKX Europe API Agreement](https://www.okx.com/en-eu/help/okx-api-agreement) | Eligibility, Minimalrechte, IP-Allowlist, Credentialschutz und kommerzielle Nutzungsgrenzen |
| OKX-SRC-005 | [OKX-Derivate-Tutorial](https://www.okx.com/en-au/help/how-can-i-do-derivatives-trading-with-the-jupyter-notebook) | offizielle Formel `ctVal × ctMult` für den Nennwert eines Derivatekontrakts in `ctValCcy` |

Die Webquellen werden nicht als unveränderliche Snapshots ausgegeben. MB5
bindet URLs, Abrufdatum und die daraus abgeleiteten Claims, nicht die Behauptung
eines dauerhaften Webseitenhashes.

## 3. Produkt-, Region- und Umgebungsprofil

### 3.1 Gewählte Contractklasse

```text
instType = SWAP
settleCcy = USDT
contract_style = linear perpetual
```

Jedes Instrument muss diese Klasse selbst belegen. Der Suffix
`-USDT-SWAP` ist ein Filterhinweis, ersetzt aber nicht `settleCcy`, `ctType`,
`ctVal`, `ctMult` und `ctValCcy` aus dem Instrumentrecord.

### 3.2 Hostpinning

Das EEA-Profil ist nur zulässig, wenn die Nutzerattestierung die passende
OKX-Registrierungsdomain und Vertragsentity bestätigt. Dann lautet der einzige
zulässige REST-Origin:

```text
https://eea.okx.com:443
```

Es gibt keinen Fallback auf `www.okx.com`, `openapi.okx.com`, `app.okx.com`,
`us.okx.com`, eine IP-Adresse oder einen providerseitig gelieferten Host. Ein
anderes Regionprofil benötigt einen neuen gepinnten Descriptor und Review.

Demo und Live dürfen niemals automatisch umschalten. Das spätere erste
Probeprofil ist ausschließlich Demo und benötigt zusätzlich den konstanten
Header `x-simulated-trading: 1`. Live wird in MB5 nicht beschrieben oder
autorisiert.

## 4. Authentifizierungs- und Credentialvertrag

Private GETs benötigen vier OKX-Header:

```text
OK-ACCESS-KEY
OK-ACCESS-SIGN
OK-ACCESS-TIMESTAMP
OK-ACCESS-PASSPHRASE
```

Der Signatur-Prehash lautet exakt:

```text
timestamp + "GET" + requestPathWithCanonicalQuery + ""
```

Er wird mit HMAC-SHA256 und dem Secret signiert und Base64-kodiert. Der
Timestamp ist UTC ISO 8601 mit Millisekunden. Queryparameter gehören zum
Requestpfad; GET besitzt keinen Body. Parameter werden nicht nach der
Signaturberechnung neu sortiert oder kodiert.

Credentialmaterial darf nur in einer später separat freigegebenen,
verschlüsselten, serverseitigen Ephemeral-Session existieren. Verboten sind:

- Browser-, URL-, LocalStorage-, Analytics-, Screenshot- oder Chattransport;
- Klartext in Git, Datenbank, Logs, Exceptions oder Evidence;
- generische Headerdumps;
- Wiederverwendung eines Live-Schlüssels im Demo-Profil;
- Key-Anlage oder Permissionänderung durch Equora.

Der Nutzer muss `Read` und das Fehlen von `Trade`/`Withdraw` attestieren.
Zusätzlich liefert `GET /api/v5/account/config` im Feld `perm` die
Permissiontokens des aktuell anfragenden API-Keys und im Feld `ip` dessen
gebundene IPs. Der Probe parst `perm` als geschlossene Tokenmenge und akzeptiert
nur exakt `read_only`; `trade`, `withdraw`, leere, duplizierte oder unbekannte
Tokens blockieren. Der von OKX in `ip` gemeldete vollständige IP-Satz wird
kanonisiert, darf weder leere noch doppelte Einträge enthalten und muss exakt
dem authority-gepinnten autorisierten Egress-IP-Satz beziehungsweise dessen
Digest entsprechen. Eine syntaktisch gültige, aber fremde oder zusätzliche
Adresse blockiert ebenso wie unspecified-, Loopback- oder sonstige nicht als
Egress autorisierte Adressen. Das belegt
`provider_reported_read_only_observed` für diesen Key und Zeitpunkt, aber keine
globale Abwesenheit anderer Account- oder Providerfähigkeiten.

Vor einem späteren Probe sind außerdem als nicht technisch aus diesem Endpoint
ableitbare Securitypins erforderlich:

- MFA am OKX-Konto ist aktiviert und vom Nutzer attestiert;
- bei vermuteter oder bestätigter Kompromittierung werden Key und zugehörige
  Agent-Autorisierung sofort widerrufen, der Key rotiert und OKX benachrichtigt;
- der Incidentstatus blockiert neue Permits, Setup-Apply, Capture und Import.

Diese Reaktionen bleiben Nutzer-/Betriebsaktionen und werden von Equora nicht
automatisch oder ohne konkrete Freigabe ausgeführt.

## 5. Account-Identität

`GET /api/v5/account/config` liefert `uid` und `mainUid`:

- `uid == mainUid`: Hauptkonto;
- `uid != mainUid`: Unterkonto.

Equora bildet die technische Connectionidentität ausschließlich aus der
gepinnten Provider-/Umgebungs-/Regionversion und `uid`. `mainUid` wird nur zur
Scopeklassifikation verwendet. Die Rohwerte dürfen nicht persistiert oder
angezeigt werden. Vorgesehen ist:

```text
identity_digest = HMAC-SHA256(
  installation_identity_key_v1,
  "equora:okx-account-identity:v1\0" +
  provider_code + "\0" + environment + "\0" + region_profile + "\0" + uid
)
```

Die HMAC-Message ist bytegenau UTF-8 ohne BOM. Ihre fünf Felder stehen in der
Reihenfolge `domain_separator`, `provider_code`, `environment`,
`region_profile_id`, `uid` und werden durch exakt ein NUL-Byte `0x00` getrennt.
Es gibt vier Separatoren, keinen abschließenden Separator und keine JSON-,
Unicode- oder Whitespace-Kanonisierung. Der Digest wird als Lowercase-Hex
ausgegeben. Eine JSON-Serialisierung derselben Werte ist nicht vertragskonform.

Der Digest ist installationsgebunden und nicht zwischen Installationen als
globaler Nutzeridentifier vergleichbar. Fehlende, leere, nichtdezimal
formatierte oder wechselnde `uid` blockiert Setup/Apply. Nutzerlabel,
API-Key-Präfix und `mainUid` allein sind keine Connectionidentität.

Vor Request 1 bindet die Connection-Authority einen erwarteten
`identity_digest`. Nach erfolgreicher Accountkonfiguration wird der beobachtete
Digest ausschließlich aus dem akzeptierten `uid` neu abgeleitet. Ein fehlender
oder abweichender Beobachtungsdigest blockiert Permit 2, Permit 3 und Apply. Die
Rohwerte bleiben auch während dieses Vergleichs nicht persistier- oder logbar.

## 6. Capability-Matrix

| Capability | GET-Pfad | Horizont/Grain | MB5-Status |
|---|---|---|---|
| Accountkonfiguration/Identität | `/api/v5/account/config` | ein Accountconfigrecord | Probeprofilkandidat |
| Kontoverfügbare Instrumente | `/api/v5/account/instruments?instType=SWAP` | ein Record je `instId` | Probeprofilkandidat |
| Orderhistorie | `/api/v5/trade/orders-history-archive?instType=SWAP` | `ordId`; abgeschlossene Orders der letzten drei Monate; stornierte Zero-Fill-Orders fehlen | dokumentierter Adapterkandidat, nicht im Minimalprobe |
| Ausführungshistorie | `/api/v5/trade/fills-history?instType=SWAP` | Eventgrain `tradeId`, Orderlink `ordId`, Cursor `billId`; `ts`-Filter, `fillTime`-Eventzeit; drei Monate | Probeprofilkandidat |
| Positionshistorie | `/api/v5/account/positions-history?instType=SWAP` | Entity `posId`, Observation/Sortierung/Cursor `uTime`; drei Monate | dokumentierter Adapterkandidat, nicht im Minimalprobe |
| Bills/Funding | `/api/v5/account/bills-archive?instType=SWAP` | `billId`; drei Monate | Mapping blockiert bis gepinnter Type-/SubType-Matrix |

Keine Capability ist damit gebaut oder in der Code-/DB-Registry registriert.

### 6.1 Bewusst ausgeschlossene Endpunkte

- `POST /api/v5/account/bills-history-archive`: read-semantischer Antrag für
  Langzeitdaten, aber mit dem GET-only-Kern unvereinbar;
- dazugehöriger späterer Download: ungeprüfte URL-/Datei-/Redirectgrenze;
- alle Order-, Algo-, Amend-, Cancel-, Close-, Transfer-, Withdrawal-, Deposit-,
  API-Key-, Subaccount- und Accountkonfigurationsmutationen;
- WebSocket-, SBE-, SDK-, MCP- und Agent-Trade-Kit-Ausführung;
- öffentliche Markttrades als Ersatz für kontobezogene Fills.

## 7. Minimales späteres Probeprofil

Der maschinenlesbare Vertrag definiert genau drei sequenzielle Demo-GETs:

1. Accountkonfiguration und minimierte Accountidentität;
2. kontoverfügbare SWAP-Instrumente, danach Filter auf `settleCcy=USDT`;
3. höchstens eine Seite Fills für ein vom Authorityobjekt fest vorgegebenes,
   produktseitig auf maximal sieben Tage begrenztes UTC-`ts`-Filterfenster mit
   `limit=10`; `fillTime` bleibt davon getrennt die Eventzeit.

Request 2 prüft zunächst bei jedem gelieferten Record die exakte Projektion,
String-Basistypen und `instType=SWAP`. Erst danach wird der dokumentierte Filter
`settleCcy=USDT && ctType=linear` angewandt. Sämtliche gefilterten Records müssen
den vollständigen ausgewählten Instrumentvertrag erfüllen und eindeutige
`instId` besitzen; mindestens ein Record muss übrig bleiben. Das
Cross-Capability-Set für Request 3 umfasst alle und nur diese gefilterten
Instrumente. Nicht ausgewählte, aber basisvalide SWAP-Records werden verworfen,
nicht als Fehler oder als akzeptierte Instrumentreferenz behandelt.

Accountkonfiguration muss dabei `perm=read_only` und eine nichtleere gültige
`ip`-Bindung melden. Nutzerattestierung, MFA-Attestierung und unverbrauchter
Incidentstatus bleiben zusätzliche Authoritypins.

Vor Request 1 bindet der Permit nur einen aus Authoritydaten abgeleiteten
Erwartungsdigest der `perm`-/`ip`-Projektion. Erst die erfolgreiche
Accountkonfigurationsresponse erzeugt den getrennten Beobachtungsdigest. Beide
müssen exakt übereinstimmen; Requests 2 und 3 sowie Setup-Apply bleiben bis zu
diesem Vergleich blockiert. Der Erwartungsdigest ist ausdrücklich kein Claim
einer bereits erfolgten Providerbeobachtung.

Gesamtbudget: drei Requests, keine Retries, keine Parallelität, höchstens eine
Seite je Read, 15 Sekunden Gesamtablauf, vier Sekunden pro Request und ein
Gesamtresponsebudget von 1.048.576 Bytes, das strenger als die Summe der drei
Capabilitymaxima ist. Ein Teilerfolg aktiviert nichts. Setup-Apply ist
erst zulässig, wenn ein geschlossenes Aggregatorakel alle drei sequenziellen
Requests, Responses und Einmal-Permits gemeinsam akzeptiert. Es bindet
Identität, Attestierung, Authority- und Capabilitydigests, den beobachteten
`perm`-/`ip`-Digest, erwartete und beobachtete Accountidentität,
Requestfenster, Instrumentreferenzen, tatsächliche Transportbytes und
-zeitpunkte, `limit=10` sowie die Konsistenz von `posMode` mit den
Fill-`posSide`-Werten. Einzelne positive Responseorakel sind kein Ersatz für
dieses Aggregate-Gate.

Jeder Einmal-Permit ist ein geschlossenes, requestgebundenes Authorityobjekt.
Er bindet mindestens Permit-ID, Connection-ID, Setup-Command und Row-Version,
Request-ID und Sequenz, Capability-ID und -Digest, Providercontract- und
Profiledigest, Authoritysnapshot, Environment, Origin, Port, Methode, exakten
Pfad mit kanonischer Query, den tatsächlichen Headernamensatz, Window,
Request-/Gesamtbudget, erwartete Providerprojektion und Accountidentität,
Authoritygeneration, Vorgänger-Response-Evidenz, beobachtete Digests für spätere
Requests, kanonisches `issued_at` und Deadline. Vor Ausführung
muss sein Zustand
`issued_unconsumed` mit Verbrauchszähler null sein; nach genau einem Request
wird er atomar zu `consumed` mit Zähler eins. Ein für einen anderen Request,
Account, Descriptor, Host, Pfad, Window, Budget oder Zeitpunkt ausgestellter
Permit ist nicht austauschbar und blockiert.

Permit 1 gehört zur Authoritygeneration 1 und enthält weder Vorgängerresponse
noch beobachtete Digests. Erst nach akzeptierter Response 1 erzeugt das System
eine hashgebundene Transport-/Response-Evidenz und die zwei beobachteten
Provider-/Identitydigests. Permit 2 gehört zur Generation 2 und bindet genau
diese Response-1-Evidenz. Permit 3 gehört zur Generation 3 und bindet zusätzlich
die akzeptierte Response-2-Evidenz. Ein vor Abschluss der Vorgängerresponse
ausgestellter oder ohne diese Transition erzeugter Permit blockiert.

Die Ablaufentscheidung verwendet ausschließlich eine vertrauenswürdige
serverseitige Runtimeuhr, niemals ein requestseitig geliefertes Zeitfeld.
`issued_at`, Serverzeit und `deadline_at` müssen endliche kanonische
UTC-ISO-Instants mit exakt Millisekunden und `Z` sein und die Ordnung
`issued_at <= server_now_at < deadline_at` erfüllen. Unparsebare oder
nichtkanonische Werte, Clock-Rollback und Ablauf blockieren fail-closed.

Das Profil ist nicht ausführbar: Window-, Identity-, Credential- und
Single-use-Permit-Authority fehlen absichtlich. Ihre spätere Erzeugung benötigt
ein neues Probe-Gate.

## 8. Response- und Fehlervertrag

Ein erfolgreicher Provider-Envelope besitzt exakt die semantischen Top-Level-
Felder `code`, `msg`, `data`; zusätzliche providerdokumentierte Metafelder
müssen vor Zulassung explizit versioniert werden. Erfolgsbedingungen:

```text
HTTP status is 2xx
code === "0"
msg === ""
data is an array
response bytes <= bound capability limit
```

Pro Response bindet eine ausschließlich serverseitig erzeugte
Transportevidenz Request-ID/-Sequenz, Capability, exakten SHA-256 und die
gemessene UTF-8-Bytezahl der tatsächlich geparsten Responsebytes sowie
`request_started_at` und `response_received_at`. Der Aggregator rechnet Bytes,
Digest und JSON-Bindung aus denselben Rohbytes neu nach; freie Zahlenclaims
reichen nicht. Die Rohresponse wird weder persistiert noch geloggt.

Vor dem semantischen Parse wird der vollständige JSON-Tokenstrom auf jeder
Objektebene auf doppelte Membernamen geprüft. Jeder doppelte Name blockiert
fail-closed; eine Last-Key-Wins-Auswertung durch `JSON.parse` ist unzulässig.

Jede Response muss vor der Permitdeadline eintreffen, ihre gemessene Dauer muss
höchstens vier Sekunden betragen und ihre Bytes müssen innerhalb des
Capabilitylimits liegen. Die drei Requests dürfen nicht überlappen; vom ersten
Requeststart bis zur letzten Response gelten höchstens 15 Sekunden und
kumuliert höchstens 1.048.576 Bytes. Der Fill-Read akzeptiert höchstens die in
der kanonischen Query gebundenen zehn Records.

Jede Capability besitzt zusätzlich einen hashgebundenen Responsevertrag mit
exakten Pflichtfeldern der zugelassenen Projektion, erlaubten Leersemaniken,
Enums, IDs, Decimal-/Vorzeichenregeln, Currency- und 13-stelligen
Unix-Millisekundenfeldern. Jedes gelieferte Projektionsfeld wird geprüft;
fehlende, unerwartete oder nur teilweise validierte Felder blockieren.
Entity-/Event-IDs müssen innerhalb einer Seite capabilityspezifisch eindeutig
sein. Die Projektion ersetzt keinen späteren Re-Review des vollständigen
Providerrecords vor Adapterbau.

Folgende Fälle sind Fehler, keine leere Seite:

- Non-2xx, Redirect oder Netzwerk-/TLS-/Timeoutfehler;
- `code != "0"`, nichtleeres `msg`, fehlendes oder nicht-arrayförmiges `data`;
- HTML, Text, komprimierte Bombe, zu großer oder ungültiger JSON-Body;
- doppelte JSON-Membernamen in Envelope-, ID-, Decimal-, Timestamp- oder
  sonstigen Providerobjekten;
- ungebundene oder manipulierte Transportbytes/-digests/-zeitpunkte,
  Capability- oder Gesamtbyteüberschreitung, Sequenzüberlappung,
  Gesamtdauerüberschreitung oder mehr als zehn Fillrecords;
- unbekannter Enum-, Decimal-, Timestamp-, Currency-, ID- oder Unitwert;
- ein Fill, dessen Filterclock `ts` außerhalb des authority- und
  permitgebundenen inklusiven Requestfensters liegt; `fillTime` bleibt eine
  getrennte Eventzeit und kann das Filterfenster nicht ersetzen;
- ein Widerspruch zwischen Account-`posMode` und Fill-`posSide`, eine
  Fill-Instrumentreferenz außerhalb der zuvor akzeptierten Instrumentprojektion
  oder ein nicht übereinstimmender erwarteter/beobachteter `perm`-/`ip`-Digest;
- Response nach Ablauf des Authoritydeadlines;
- unparsebare, nichtkanonische, zurückgesetzte oder requestseitig gelieferte
  Runtimezeit;
- Request ohne unbenutzten Single-use-Permit;
- Partial Success in einer Dreiersequenz.

Nur `code="0"`, `msg=""`, `data=[]` ist eine erfolgreiche leere Seite für
den exakt abgefragten Scope. Sie belegt weder Retention noch Vollständigkeit.
Providertexte werden auf eine feste lokale Fehlerklasse reduziert.

## 9. Pagination, Zeit und Vollständigkeit

- Zeitwerte bleiben zunächst validierte Unix-Millisekunden-Strings und werden
  deterministisch in UTC-Mikrosekunden normalisiert.
- Ein Probe-Read hat eine Seite. Capturepagination wäre erst MB6/MB7.
- Queryparameter `before` und `after` dürfen niemals gemischt werden.
- Orderarchive: `after` liefert Records vor `ordId`; `ordId` ist Grain und
  Cursor. Der Drei-Monats-Endpoint enthält keine stornierten Orders ohne Fill.
  Deren zweistündige Sichtbarkeit gehört ausschließlich zum ausgeschlossenen
  Last-Seven-Days-Endpoint und darf nicht dem Archive zugeschrieben werden.
- Fills: `after` liefert Records vor `billId`; `billId` ist Cursor,
  `tradeId` Eventgrain und `ordId` Orderlink. `begin`/`end` filtern `ts`, während
  `fillTime` die fachliche Ausführungszeit bleibt.
- Positionshistory: `uTime` ist Sortier-, Filter- und Cursordimension;
  `posId` bezeichnet die Positionentity. Records mit identischem `uTime`
  müssen gemäß Providervertrag gemeinsam ausgewertet und dürfen nicht durch
  einen erfundenen `posId`-Cursor übersprungen werden. Eine Observation wird
  mindestens über `(posId,uTime)` gebunden.
- Bills: `after` liefert Records vor `billId`; Filterzeit ist `ts`.
- Wiederholte Seite, wiederholter Cursor, nichtmonotone Grenze, unbekannte
  Sortierung, Scopeüberschreitung oder Budgetende erzeugt `partial/blocked`.
- Gleichzeitige Records bleiben über capabilityspezifische Entity-/Event-IDs
  getrennt; eine Timestampgrenze allein ist kein universeller Cursor.
- Drei Monate sind `provider_window_observed_or_documented`, nicht
  `account_history_complete`.

## 10. Fachliche Grains und Einheiten

### 10.1 Instrument

Grain: `(provider, environment, instId, metadata_contract_version)`.
Pflichtfelder für USDT-SWAP: `instId`, `instType=SWAP`, `instFamily`,
`settleCcy=USDT`, `ctType=linear`, `ctVal`, `ctMult`, `ctValCcy`, `lotSz`,
`tickSz`, `state=live`. `ctVal`, `ctMult`, `lotSz` und `tickSz` sind numerisch
strikt positiv; numerisch äquivalente Nullstrings wie `0.0` blockieren. Ein
stiller Default für `ctMult` ist verboten. OKX-SRC-005 dokumentiert den
Nennwert eines Derivatekontrakts ausdrücklich als `ctVal × ctMult` in
`ctValCcy`; die Formel wird daher nicht aus Feldnamen erraten.

### 10.2 Order

Grain: `ordId`. Mehrere Fills dürfen nicht zu mehreren Orders werden.
Orderstatus und Category-/Source-Enums sind versioniert; unbekannte Werte
blockieren. Eine fehlende unvollständig stornierte Order darf nicht aus Fills
erfunden werden.

### 10.3 Execution

Grain: `tradeId`; `ordId` ist der Orderlink. Blocktrades oder dokumentierte
Sonderfälle mit leerem `ordId` benötigen eine eigene Identityregel und sind im
ersten Profil blockiert. `fillTime` ist die fachliche Ausführungszeit; `ts` ist
nicht still gleichzusetzen.

### 10.4 Position

Entity: `posId`; versionierte Observation mindestens `(posId,uTime)`. Der
Historyendpoint liefert kein aktuelles `pos`-Feld. Ausgewertet werden
`account/config.posMode`, `posSide`, `direction`, `openMaxPos` und
`closeTotalPos`:

- `net_mode`: `posSide=net`; Richtung kommt ausschließlich aus dem
  dokumentierten `direction` (`long` oder `short`), nicht aus einem erfundenen
  Vorzeichenfeld;
- `long_short_mode`: `posSide` ist `long` oder `short` und muss mit `direction`
  übereinstimmen; getrennte Observations, kein gegenseitiges Netting;
- `openMaxPos` und `closeTotalPos` sind nichtnegative Kontraktmengen;
- unbekannte oder widersprüchliche Kombination: blockiert.

Eine Position ist nicht automatisch ein Trade. Opening/closing, Realized-PnL,
Fees und Funding bleiben getrennte Evidenzkomponenten.

### 10.5 Menge, Preis, Fee, Funding und PnL

- alle Finanzzahlen erfüllen `^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$`; Pluszeichen,
  Exponentnotation, Leading Zeros, negative Null, mehr als 38 Ganzzahl- oder 18
  Nachkommastellen und binäre JavaScript-Floatarithmetik sind verboten;
- `sz`, `fillSz`, `ctVal`, `ctMult`, `lotSz`, `tickSz` und positive Preise
  sind nach skalierter Decimalauswertung strikt größer null; Stringvergleich
  mit `"0"` genügt nicht. `accFillSz`, `openMaxPos` und `closeTotalPos` sind
  nichtnegative Mengen. Fee-/PnL-Komponenten dürfen vorzeichenbehaftet sein;
- `sz` bei `SWAP` ist Kontraktanzahl, nicht Basismenge;
- für das ausgewählte lineare Profil mit `ctValCcy` gleich Basiscurrency gilt
  versioniert `base_quantity = contracts × ctVal × ctMult`; die Rechnung
  erfolgt mit skalierter Integer-/Decimalarithmetik. Andere Contractklassen
  oder Currencies blockieren;
- `fee` und `feeCcy` bleiben zusammen; Vorzeichen wird nicht pauschal invertiert;
- Funding wird nur aus kontobezogenen, eindeutig klassifizierten Bills oder
  Positionsfeldern übernommen und nie doppelt gezählt;
- Positionshistory muss die offiziell dokumentierte Invariante
  `realizedPnl = pnl + fee + fundingFee + liqPenalty + settledPnl` exakt in
  Decimalarithmetik erfüllen. `settledPnl` ist laut OKX nur für Cross-FUTURES
  anwendbar. Im ausgewählten SWAP-Scope muss das Feld vorhanden, aber leer
  sein; dieser Providerzustand bleibt erhalten und wird ausschließlich für die
  Invariantenrechnung neutral als null behandelt. Fehlendes Feld, ein
  nichtleerer SWAP-Wert oder eine unzulässige Leersemanik in einer
  anwendbaren Contractklasse blockieren. Alle Komponenten bleiben separat
  erhalten und werden nicht zu einer frei erfundenen Journal-Nettogröße;
- fehlende Currency oder unbekannte Bill-Subtypen blockieren die betroffene
  Komponente.

## 11. Claims und Produktdarstellung

Zulässige spätere Aussagen nach einem erfolgreichen Probe sind eng:

- „OKX-Demoread für die drei gepinnten Endpunkte erfolgreich“;
- „Accountidentität für diesen Demo-Scope stabil beobachtet“;
- „bis zu zehn Fills im freigegebenen Fenster beobachtet“.

Unzulässig bleiben:

- „der verbundene OKX-Broker-Sync/API-Provider ist unterstützt/verfügbar“ vor
  MB7; diese Grenze betrifft nicht den bestehenden manuellen OKX-CSV-Import;
- „der Schlüssel ist technisch vollständig read-only geprüft“;
- „vollständige Kontohistorie“ oder „alle Trades importiert“;
- „keine Gaps“, „korrektes PnL“ oder „Funding vollständig“ allein aus dem Probe;
- Live-, Production-, Capture- oder Importbereitschaft;
- kommerzielle Nutzungsberechtigung ohne geklärte Vertragslage.

## 12. Rechts-/Produktgrenze

Der am Prüftag aktuelle OKX-Europe-API-Vertrag enthält eine ausdrückliche
Beschränkung für Kommerzialisierung, SaaS, Brokerage und Drittweitergabe ohne
schriftliche OKX-Autorisierung. Equora darf daher aus MB5 keinen kommerziellen
Releaseclaim ableiten. Entsperren kann nur eine ausdrückliche schriftliche
OKX-Autorisierung oder ein späterer, neu versionierter OKX-Vertrag, der die
konkrete Nutzung ausdrücklich erlaubt. Eine interne Einschätzung „permitted“
genügt nicht. Dies ist eine Releasevoraussetzung, keine durch Code oder Fixture
ersetzbare Formalität.

Auch bei zulässiger Nutzung bleiben Markt-, Konto- und Produktverfügbarkeit
jurisdiktions- und accountabhängig.

## 13. MB5-Gate

MB5 ist lokal nur bestanden, wenn:

- Produktentscheidung, Contract und maschinenlesbares Profil konsistent sind;
- alle Capability- und Profiledigests reproduzierbar sind;
- synthetische Positive und Pin-, Replay-, Budget-, Timeout-, Partial-,
  Response-, Transport-, Byte-, Zeit-, Identity-, Authoritytransition-,
  Recordlimit-, Decimal-, Enum- und Apply-Negative bestehen;
- ein Offline-Secretscan den gesamten Kandidatenscope besteht;
- Typecheck, vollständige Tests, Release Check und Build bestehen;
- A3, A4 und A5 exakt denselben Hashsnapshot ohne offene P0–P2-Befunde prüfen.

Ein lokales MB5-PASS bedeutet ausschließlich, dass der Vertrag als Grundlage
für eine separat freizugebende MB6-Implementierung taugt. Es autorisiert weder
einen Adapter noch einen Providerrequest.

## 14. Autorisierungsgrenze

```text
EQUORA_MEXC_RUNTIME_MODE = off
OKX_ADAPTER_REGISTERED = false
OKX_PROVIDER_REQUEST_AUTHORIZED = false
CREDENTIAL_ACTION_AUTHORIZED = false
SUPABASE_OR_PRODUCTION_ACTION_AUTHORIZED = false
CRON_CAPTURE_IMPORT_AUTHORIZED = false
GIT_STAGING_COMMIT_PUSH_PR_MERGE_AUTHORIZED = false
```

Frühere Freigaben gelten nicht als Dauerfreigabe. Jede nächste lokale oder
externe Einheit benötigt ihre eigene konkrete Autorisierung.
