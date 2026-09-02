# Equora Post-v57.61.0 – Tax Event Ledger Roadmap

Status: Roadmap, nicht implementiert

Stand: 2026-09-01

Geltungsbereich: providerneutrale Erfassung und nachvollziehbare Aufbereitung steuerrelevanter Kryptoaktivitäten

## 1. Entscheidung

Eine automatische, brokerübergreifende Erfassung von Käufen, Verkäufen und weiteren steuerrelevanten Vorgängen ist technisch möglich. Sie darf jedoch nicht als Erweiterung des bestehenden Trade-Journals missverstanden werden.

Der fachlich belastbare Zielzustand ist ein eigenständiges, revisionssicheres **Tax Event Ledger**, das die bereits vorgesehene providerneutrale Capture-, Raw-Event- und Provenance-Infrastruktur wiederverwendet. Das Ledger führt Spot-, Derivate-, Transfer-, Gebühren- und Ertragsereignisse zusammen, ohne Brokerdaten stillschweigend umzudeuten oder Originaldaten zu überschreiben.

Dieser Track wird erst nach dem aktuellen Modern-Journal-/Broker-Onboarding-Track umgesetzt. Dieses Dokument aktiviert weder Broker-Runtimes noch automatische Importe, Datenbankmigrationen, Cron-Jobs oder Production-Funktionen.

## 2. Fachliche Abgrenzung

Ein Journal-Trade allein reicht für eine belastbare Steueraufbereitung nicht aus. Benötigt werden mindestens:

- vollständige Kauf-, Verkaufs- und Tauschvorgänge einschließlich Gebühren,
- Einzahlungen, Auszahlungen und interne Transfers,
- Fiatbewegungen und Wechselkurse,
- realisierte Gewinne und Verluste aus Futures und Margin,
- Funding, Liquidationen und derivative Gebühren,
- Staking-, Lending-, Mining-, Airdrop- und sonstige Erträge,
- Herkunft, Konto beziehungsweise Wallet, Zeitstempel und externe Identifikatoren,
- Nachweise zu Datenlücken, Korrekturen, Dubletten und Bewertungsannahmen.

Das Produkt darf deshalb erst dann als für die Steueraufbereitung geeignet bezeichnet werden, wenn Vollständigkeit, Herkunft und Rechenregeln prüfbar sind. Begriffe wie „steuerfertig“, „finanzamtssicher“ oder „vollständig automatisch“ sind ohne fachliche und rechtliche Validierung unzulässig.

## 3. Architekturprinzipien

### 3.1 Wiederverwendung statt zweiter Brokerintegration

API-, CSV-, XLSX- und spätere Wallet-/Blockchain-Quellen speisen dieselbe providerneutrale Erfassungskette:

1. Source Artifact oder API Capture
2. unverändertes Raw Event mit Inhaltsnachweis
3. providerneutrale Normalisierung
4. fachliche Reconciliation und Lückenanalyse
5. Tax-Event-Projektion
6. versionierte Klassifikation und Lot-/Bewertungsberechnung
7. Export- und Evidenzpaket

Brokeradapter liefern ausschließlich quellnahe Daten und deklarierte Fähigkeiten. Sie berechnen keine Steuer und schreiben keine steuerliche Klassifikation in Originalereignisse zurück.

### 3.2 Trennung der Vertrauenszonen

- **Raw Layer:** unveränderte Quelldaten, append-only während der Aufbewahrung, mit Hash, Quelle und Capture-Zeitpunkt.
- **Normalized Layer:** providerneutrale fachliche Ereignisse mit expliziten Unsicherheiten.
- **Tax Event Ledger:** steuerlich relevante Projektion mit referenzierten Ursprungsereignissen.
- **Policy Layer:** versionierte Regeln je Jurisdiktion und Steuerjahr.
- **Calculation Layer:** nachvollziehbare Lots, Bewertungen und Ergebnisse.
- **Report Layer:** Exporte, Reconciliation-Berichte und Evidenz; keine stille Korrektur der darunterliegenden Daten.

### 3.3 Fail-closed

Unbekannte oder widersprüchliche Sachverhalte bleiben `UNKNOWN`, `UNCLASSIFIED` oder `NEEDS_REVIEW`. Das System darf fehlende Anschaffungskosten, unklare Transfers, unvollständige Zeiträume oder unbekannte Gebühren nicht durch Schätzwerte kaschieren.

## 4. Ereignisumfang

### 4.1 Spot und Walletbewegungen

- Kauf, Verkauf und Asset-zu-Asset-Tausch,
- Einzahlung, Auszahlung und interner Transfer,
- Netzwerk-, Handels- und sonstige Gebühren,
- Fiat-Einzahlung, Fiat-Auszahlung und Währungsumrechnung,
- Rückzahlung, Reversal und Storno als eigene Revision oder Gegenbuchung.

### 4.2 Derivate und gehebelte Produkte

- Futures-/Perpetual-/Margin-Ausführung,
- realisierter Gewinn oder Verlust,
- Funding-Zahlung oder -Gutschrift,
- Margin-Zins und derivative Gebühren,
- Liquidation und Auto-Deleveraging, soweit die Quelle dies ausweist.

Offene Positionen, Orders und Ausführungen bleiben getrennte fachliche Objekte. Eine Order ist kein steuerliches Ereignis, solange keine relevante Ausführung oder finanzielle Kontobewegung vorliegt.

### 4.3 Erträge und Sonderfälle

- Staking, Lending, Mining und Rewards,
- Airdrops, Referral- und sonstige Boni,
- Liquidity-Pool-Zugänge/-Abgänge und zugehörige Erträge,
- manuelle Ergänzungen nur mit Grund, Evidenz, Akteur und Zeitstempel.

Der genaue steuerliche Status dieser Ereignisse ist Policy- und Jurisdiktionssache und wird nicht im Brokeradapter fest verdrahtet.

## 5. Kanonischer Tax-Event-Vertrag

Jedes Tax Event benötigt mindestens:

- stabile Eigentümer-, Konto- und optional Wallet-Identität,
- Source-Artifact-, Raw-Event- und Normalized-Event-Referenzen,
- Quell- und Inhaltsdigests,
- Provider, Provider-Konto und deklarierte Providerfähigkeit,
- Ereignistyp und UTC-Zeitpunkt mit dokumentierter Zeitzonenherkunft,
- eingehendes Asset und Menge,
- ausgehendes Asset und Menge,
- Gebühren-Asset und Gebührenmenge,
- Fiatwert, Fiatwährung, Preisquelle, Preiszeitpunkt und Bewertungsregel,
- Order-, Trade-, Transaktions- oder Ledger-ID, soweit geliefert,
- Transfer-Match oder expliziten Unmatched-Status,
- Klassifikationsstatus und Policy-Version,
- Provenance, Evidenzstatus und technische Konfidenz,
- Revisions-, Supersession- und Korrekturbeziehung.

„Konfidenz“ beschreibt nur die technische Zuordnungsqualität. Sie ist keine Aussage über steuerliche Richtigkeit.

## 6. Vollständigkeit und Reconciliation

Für jedes Konto, jede Quelle, jede deklarierte Fähigkeit und jeden Zeitraum werden folgende Nachweise geführt:

- linke und rechte Zeitgrenze der Abdeckung,
- erkannte Lücken und nicht unterstützte Ereignistypen,
- Zahl gelesener, verworfener, deduplizierter und akzeptierter Datensätze,
- Anfangs- und Endbestände, soweit verfügbar,
- Salden- und Cashflow-Reconciliation je Asset,
- eindeutige Dubletten- und Revisionsschlüssel,
- Matching von Transfers zwischen eigenen Konten und Wallets,
- fehlende Anschaffungshistorie und ungeklärte Abflüsse,
- Quelle, Version und Einstellungen jedes Imports.

Ein grüner Importstatus belegt nur die technische Verarbeitung. Er belegt nicht die Vollständigkeit der Steuerhistorie.

## 7. Korrekturen und Audit Trail

- Originaldaten werden nie überschrieben.
- Korrekturen erzeugen neue, referenzierte Revisionen.
- Jede Korrektur enthält Grund, Evidenz, Akteur und Zeitpunkt.
- Vorherige Klassifikationen und Berechnungen bleiben nachvollziehbar.
- Erneute Importe müssen idempotent sein und Überlappungen erkennen.
- Manuelle Korrekturen dürfen nicht durch einen späteren Import unbemerkt verloren gehen.

## 8. Policy- und Bewertungsengine

Die steuerliche Engine wird nach Jurisdiktion, Steuerjahr und Regelversion getrennt. Deutschland ist ein möglicher erster Zielmarkt, jedoch erst nach fachlicher Prüfung durch qualifizierte Steuerexpertise.

Notwendige Festlegungen sind unter anderem:

- Verbrauchsfolgeverfahren wie FiFo und dessen Anwendungsgrenze,
- Trennung von Wallets und Konten,
- Eurobewertung und zulässige Preisquellen,
- Behandlung von Gebühren, Transfers, Erträgen und Derivaten,
- Rundung, Zeitzone und Tagesgrenzen,
- Umgang mit fehlenden Kursen oder Anschaffungskosten.

Keine dieser Regeln darf stillschweigend gewählt oder rückwirkend verändert werden. Jede Berechnung referenziert die konkrete Policy- und Preisquellenversion.

## 9. Geplante Ergebnisse

### Frühe Ergebnisse

- vollständiger Ereignis- und Quellenexport,
- Gap- und Reconciliation-Bericht,
- Evidenzpaket mit Originaldateien beziehungsweise Capture-Digests,
- interoperabler CSV-Export für gängige Steuertools.

Ein Export in generische beziehungsweise dokumentierte Blockpit- oder CoinTracking-Formate ist ein sinnvolles Interoperabilitätsziel. Er bedeutet keine Zertifizierung oder Qualitätsgarantie durch diese Anbieter.

### Spätere Ergebnisse

- versionierte Lot- und Bewertungsberechnung im Shadow Mode,
- erklärbare steuerliche Zusammenfassung,
- optionaler Steuerbericht erst nach externer fachlicher und rechtlicher Validierung.

## 10. Phasenplan

### T0 – Datenvertrag und Fachprüfung

- Ereignistaxonomie und Pflichtfelder festlegen,
- Deutschland-spezifische Anforderungen mit Steuerexpertise prüfen,
- Provider-Capability-Matrix um steuerrelevante Datendomänen ergänzen,
- Aufbewahrungs-, Export-, Lösch- und Datenschutzkonzept festlegen,
- Produktclaims und Haftungsgrenzen definieren.

Gate: freigegebener Datenvertrag, keine offenen P0–P2-Befunde und keine unbelegten Steuerclaims.

### T1 – Passives Quellenarchiv

- API-/Datei-Artefakte und Raw Events revisionssicher erfassen,
- Quellenhashes, Zeitabdeckung und Importstatistiken speichern,
- weder Steuerklassifikation noch automatische Lot-Berechnung.

Gate: idempotente Wiederholung, nachweisbare Originaltreue und belastbarer Lückenbericht.

### T2 – Providerneutrales Tax Event Ledger

- normalisierte Steuerereignisse projizieren,
- Spot, Derivate, Transfers, Gebühren und Erträge fachlich trennen,
- Coverage-, Balance- und Cashflow-Reconciliation bereitstellen,
- unklare Sachverhalte fail-closed markieren.

Gate: vollständige Testfixtures pro unterstützter Providerfähigkeit sowie unabhängiger Daten-, Sicherheits- und Steuerreview.

### T3 – Transfer-Matching und Lot Engine

- kontoübergreifende Transfers deterministisch beziehungsweise prüfbar vorschlagen,
- Policy- und Preisquellen versionieren,
- Lots und Bewertungen zunächst ausschließlich im Shadow Mode berechnen,
- jede Berechnung bis zum Originalereignis erklären.

Gate: Property-, Metamorphic- und adversariale Tests; keine ungeklärten P0–P2-Befunde.

### T4 – Interoperabilität und Evidenzexport

- generisches, dokumentiertes CSV-Schema,
- Exportadapter für ausgewählte Steuertools,
- Source-of-Funds-, Gap- und Reconciliation-Evidenz bündeln,
- Roundtrip- und Überlappungstests durchführen.

Gate: kontrollierte Testimporte ohne stillen Datenverlust oder Dubletten; keine Behauptung einer Anbieterzertifizierung.

### T5 – Optionaler Steuerbericht

- nur nach professioneller externer Validierung,
- jurisdiktions- und steuerjahrspezifisch versioniert,
- reproduzierbar aus eingefrorenem Daten-, Policy- und Preisquellenstand.

Gate: gesonderte Produkt-, Rechts-, Datenschutz-, Security- und Production-Freigabe.

## 11. Mindestabnahmekriterien vor einem Production-Pilot

- alle in Scope befindlichen Konten und Wallets sind ausdrücklich erfasst,
- Zeitraum, Eventtypen und Providerfähigkeiten sind vollständig oder als Lücke ausgewiesen,
- deduplizierte Reimporte sind byte- beziehungsweise semantisch reproduzierbar,
- Salden und Cashflows sind je Asset reconciliert oder mit offenen Abweichungen gesperrt,
- Transfers, Gebühren und Derivate werden nicht als gewöhnliche Spot-Trades verfälscht,
- jede Korrektur und Berechnung besitzt einen vollständigen Audit Trail,
- Secrets und rohe Broker-Credentials gelangen weder in Exporte noch in Logs,
- Datenexport, Aufbewahrung und Löschung sind fachlich und datenschutzrechtlich geklärt,
- unabhängige Architektur-, Datenintegritäts-, Security- und Steuerreviews sind grün,
- Production, automatische Importe und zeitgesteuerte Jobs besitzen jeweils eine konkrete neue Freigabe.

## 12. Nichtziele dieses Roadmap-Eintrags

- keine Steuerberatung oder Rendite-/Steuergarantie,
- keine Umsetzung einer Steuerberechnung im aktuellen Branch,
- keine Aktivierung von Broker-, MEXC-, OKX-, Cron-, Capture- oder Import-Runtimes,
- keine Migration oder Änderung der Production-Datenbank,
- keine automatische Entscheidung bei unvollständigen oder widersprüchlichen Daten,
- keine Ablösung einer professionellen Steuerprüfung.

## 13. Quellenbasis

Die fachliche Richtung wurde am 2026-09-01 anhand folgender Primär- beziehungsweise Anbieterquellen geprüft:

- Bundesministerium der Finanzen, Einzelfragen zur ertragsteuerrechtlichen Behandlung bestimmter Kryptowerte, insbesondere Randnummern 87–90 und 101–104: <https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Einkommensteuer/2025-03-06-einzelfragen-kryptowerte.html>
- Amtliches Einkommensteuer-Handbuch 2025, Anhang 4: <https://ao.bundesfinanzministerium.de/esth/2025/B-Anhaenge/Anhang-04/inhalt.html>
- Blockpit, generischer CSV-/Excel-Import und dessen Grenzen: <https://intercom.help/blockpit/en/articles/12137128-how-to-import-my-csv-excel-history>
- Blockpit, Beispiel eines Source-of-Funds-Reports: <https://cdn.blockpit.io/documents/Source%20of%20Funds%20Report_Example_EUR_2025-11-06.pdf>
- CoinTracking, API-Datenmodell und Transaktionstypen: <https://cointracking.info/api/api.php>
- CoinTracking, Importübersicht: <https://cointracking.info/imports>

Anbieterbeschreibungen belegen unterstützte Formate und beworbene Funktionen, nicht deren Vollständigkeit oder steuerliche Richtigkeit. Die konkreten Steuerregeln und Produktclaims müssen vor Implementierung erneut gegen den dann aktuellen Rechts- und Produktstand geprüft werden.
