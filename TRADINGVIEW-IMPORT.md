# Equora TradingView Zwei-Bild-Import

Stand: v57.60

## Ziel

Equora trennt die strukturierte Datenquelle vom visuellen Kontext:

1. **Positions-Einstellungen**: OCR liest Entry, Stop, Ziel, Risiko und weitere Werte.
2. **Chart-Kontext**: optionales Review-Bild mit Marktstruktur, Indikatoren und sichtbarer Position.

Das ist keine offizielle TradingView-API, keine Broker-Verbindung und keine Order-Ausführung.

## Ablauf

1. In TradingView das Long- oder Short-Positionstool auswählen.
2. Das vollständige Einstellungsfenster inklusive Feldnamen ausschneiden.
3. In Equora im linken Slot „Positions-Einstellungen“ einfügen.
4. Optional den Chart im rechten Slot „Chart-Kontext“ ergänzen.
5. „Einstellungen analysieren“ ausführen.
6. Werte, Konfidenzen und Plausibilitätsprüfung lesen.
7. „Vorschläge übernehmen“ wählen, sofern keine kritischen Widersprüche bestehen.
8. Trade speichern.

## Strg + V

- Das zuletzt aktivierte Bildfeld erhält den nächsten eingefügten Screenshot.
- Nach dem ersten Einstellungen-Screenshot wechselt Equora automatisch zum Chartfeld.
- Einstellungen und Chart dürfen nicht identisch sein. Ein Datei-Fingerprint verhindert doppelte Bilder in beiden Slots.

## Erkennbare Felder

Deutsch und Englisch werden unterstützt:

- Long / Short
- Markt, falls sichtbar
- Entry / Einstiegspreis
- Exit / Ausstiegspreis
- Stop-Loss / Stop-Level
- Take Profit / Profit Level / Gewinnziel
- Positionsgröße
- Kontogröße
- Risiko in Prozent
- Risikobetrag
- Hebel
- CRV
- P&L, falls tatsächlich als realisiertes P&L beschriftet

„Profit Level“ wird nicht als realisierter Gewinn interpretiert.

## Plausibilitätsprüfung

Equora prüft unter anderem:

- Liegt der Stop für Long unter dem Entry beziehungsweise für Short darüber?
- Liegt das Ziel auf der korrekten Seite?
- Wirkt das Risiko unplausibel hoch oder fehlerhaft?
- Ist der Hebel plausibel?
- Passen Risikobetrag, Kontogröße und Risiko-Prozent ungefähr zusammen?
- Stimmen angegebenes und aus Entry/Stop/Ziel berechnetes CRV ungefähr überein?

Ergebnisse:

- **Grundlogik plausibel**: keine harten Widersprüche.
- **Prüfung nötig**: Werte können übernommen werden, müssen aber bewusst kontrolliert werden.
- **Kritischer Widerspruch**: automatische Übernahme ist blockiert. Die Bilder können trotzdem gespeichert werden.

## Speicherung ohne neuen SQL-Patch

Beide Dateien werden über das vorhandene `trade_media`-System gespeichert. Die Rolle wird vorerst über den Dateinamen sichtbar gehalten:

- `tradingview-settings-...`
- `tradingview-chart-...`

Das Einstellungen-Bild steht zuerst und bleibt damit das primäre Bild, solange keine anderen Uploads davor angeordnet werden.

## Sicherheitsgrenze

- Jeder OCR-Wert bleibt ein Vorschlag.
- Keine automatische Order.
- Kein API-Key erforderlich.
- Keine Trading-, Transfer- oder Withdrawal-Rechte.
- Kritische OCR-Widersprüche werden nicht automatisch in das Formular übernommen.

## Bekannte Grenzen

- Der Markt steht nicht immer im Einstellungsfenster.
- Themes, Zoom, Auflösung und TradingView-Updates können OCR beeinflussen.
- Punkt und Komma müssen besonders geprüft werden.
- Ein Screenshot kann nicht zuverlässig beweisen, dass ein Trade tatsächlich ausgeführt wurde.

## Branding

Equora nutzt weiterhin ein neutrales Chart-Symbol mit Textbezeichnung. Offizielle Markenlogos sollen nur mit geprüften Brand-Assets und ohne Partnerschaftseindruck eingebunden werden.
