# Equora Produkt-Glossar v57.42

Dieses Glossar stabilisiert die sichtbare Sprache in der App. Neue UI-Texte sollen diese Begriffe verwenden.

| Begriff | Bedeutung | Nicht verwenden |
| --- | --- | --- |
| Start | Einstieg nach dem Login | Dashboard im sichtbaren Hauptmenü |
| Trade erfassen | neuen Trade eintragen | Capture, Eintrag erstellen |
| Trades | Liste und Bearbeitung aller Trades | Ledger als Menüpunkt |
| Setup | wiederholbares Handelsmuster | Strategie, Playbook-Regel |
| Master-Setup | globales Setup aus der Admin-Bibliothek | Admin-Setup, Standard-Setup |
| Setup vorschlagen | Setup-Idee an Admins senden | Submission, Setup-Request |
| Review | Plan, Umsetzung und Lernpunkt prüfen | Rückblick, Auswertung als Hauptbegriff |
| Kalender | Tagesansicht der Trades | Tagesnotiz |
| Statistik | Kennzahlen und Kurven | Analytics im UI |
| Sessions | gespeicherte Review-Blöcke | Review Hub |
| Vault | geteilte Trades und Community-Setups | Share als sichtbarer Hauptbegriff |
| Import | CSV-Import von Trades | Upload-Strecke |
| P&L | Gewinn/Verlust eines Trades oder Zeitraums | Ergebnis, Net P&L, Netto P&L |
| P&L Vorschau | direkte Vorschau aus Entry, Exit und Size vor dem Speichern | P&L-Rechner, Ergebnisrechner |
| Status | offen, geschlossen, unvollständig, gewonnen, verloren | Ergebnis für Statusfelder |
| R | Chance/Risiko-Verhältnis | R-Multiple im sichtbaren Kurzlabel |
| Risiko | Risiko pro Trade | Risk im sichtbaren UI |
| Size | Positionsgröße | Lots nur als Spezialfeld |
| Entry | Einstiegspreis | Einstieg, Kaufpreis |
| Exit | Ausstiegspreis | Verkauf, Close-Preis |
| Stop | Invalidierungsmarke | Stop Loss als Langlabel |
| Tags | freie Markierungen | Labels, Schlagwörter |
| Heute | aktueller Handelstag | Tagesfokus |
| Timing | Zeitfenster und Tagesrhythmus | Dashboard-Insight, Zeitfenster-Insight |
| Verhaltensprüfung | Review-Signale zu Regel, Zustand und Lerneffekt | Review-Layer im UI |

## Sprachregel für sichtbare UI

Sichtbare Texte sprechen aus Trader-Sicht. Sie erklären nicht, warum ein Feature an einer bestimmten Stelle liegt, sondern was der Trader daraus ableiten kann.

Nicht in sichtbaren UI-Texten verwenden:
- „Nicht in der Erfassung …“
- „Hier bleibt es …“ als interne Platzierungsbegründung
- „Feature“, „Flow“, „Layer“, „Capture“
- technische Begründungen wie „keine Migration nötig“
- interne Architekturwörter als Nutzerführung

Kurzregel: sichtbare UI nutzt kurze Labels. Längere Erklärungen nur dort, wo der Nutzer aktiv eine Detail-Ebene öffnet.


## UI-Sprache ab v57.22

Sichtbare Texte erklären dem Trader nicht, warum etwas intern an einer bestimmten Stelle platziert wurde. Sie beantworten nur drei Fragen: Was sehe ich? Was sagt es über mein Trading? Was ist der nächste kleine Schritt?

Nicht sichtbar verwenden: interne Platzierungslogik, Entwicklungsbegriffe, technische Rechtfertigungen, doppelte Handlungsaufforderungen auf derselben Fläche.


## UI-Sprache ab v57.22

- Die optionale Notizfläche heißt sichtbar **Daily Note**, nicht Flow und nicht Tagesfokus.
- Statistikflächen dürfen Zahlen zeigen, aber keine Kachel-in-Kachel-Wände bauen.
- Ein Button muss immer dort hinführen, was sein Text verspricht.


## Tagesnotiz ab v57.22

- Keine Pflicht-Notiz ohne Trade.
- Dashboard zeigt Status, nicht Schreibdruck.
- Review wird nur als offen markiert, wenn heute Trades vorhanden sind.
- Tagesnotizen bleiben optional und dürfen nicht den Start füllen.

## Dashboard ab v57.23

- Kein Fokus-Text als Dashboard-Headline.
- Kein „Fokus setzen“ ohne direkte Funktion.
- Die Heute-Karte zeigt Tagesstatus, nicht Daily-Note-Inhalt.
- Fokus gehört in Review- oder Notizkontexte, nicht auf den Start.


## Beta-Readiness ab v57.42

- Leere Zustände führen zum nächsten kleinen Schritt: Trade erfassen, Datei importieren oder Setup anlegen.
- Import-Hinweise nennen Datenlücken klar, ohne technische Rohfehler zu zeigen.
- Vault bleibt als Begriff erlaubt, muss in Navigation und Hilfetexten aber kurz erklärt werden.
- Daily Note ist optional. Kein Nutzer soll daraus eine Pflicht zum Schreiben ableiten.
- R bleibt offen, wenn Stop oder initiales Risiko fehlen. Keine scheinbare 0.00R anzeigen.
