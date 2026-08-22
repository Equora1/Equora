# Equora v57.61.0 – MB3 additive Datenbank- und Authority-Vertrag

Stand: 2026-08-22

Baseline: `origin/main` / `618a6e62600bb98ee8c70d53942bfbab3a8778e1`

Arbeitsbranch: `codex/multibroker-mb3-v57.61.0`

## 1. Entscheidung und Scope

MB3 ist ein additives, lokal getestetes Datenbankdelta hinter dem in MB2
integrierten providerneutralen Dispatcher. Es führt keinen zweiten Provider
ein, aktiviert keine Runtime und ersetzt keinen bestehenden MEXC-v1-Vertrag.

Der Kandidat umfasst ausschließlich:

- eine versionierte, serververwaltete Provider-/Capability-Registry v2;
- konto-, tenant- und providerbezogene Runtime-Enrollments v2 ohne Defaultrow;
- getrennte Operator-Control- und Runtime-Authority-Rollen;
- append-only Operator- und Runtime-Receipts;
- providerneutrale Checkpoint-, Request-Authorization- und Page-Commit-RPCs v2;
- explizite Query-, Cursor-, Response-, Raw-Envelope-, Normalization-,
  Page-Scope-, Checkpoint- und MAC-Versionen;
- Composite FKs, RLS-, ACL-, Index-, CAS-, Replay- und Lockverträge;
- sechs disposable lokale SQL-Entry-Points für Fresh, Upgrade,
  Compatibility, Partial Failure/Recovery, Drift und Concurrency.
- einen ausdrücklich autorisierten Test-Harness-Pfad
  `tests/multibroker-core-contracts.test.ts`; dort wird ausschließlich das
  testlokale Timeout des bestehenden manifest-/evidenzintensiven MB2-
  Negativtests von 240 auf 360 Sekunden erhöht. Assertions, Validatorsemantik
  und Produktcode bleiben unverändert.

Nicht in Scope sind:

- Änderung von `EQUORA_MEXC_RUNTIME_MODE=off`;
- Product-Control-Flow-Verdrahtung des v2-Persistenzpfads;
- MEXC- oder andere Brokerrequests, Credentialzugriff oder Capture;
- Cron, Scheduler-Enrollment, Normalisierung, Reconciliation, Approval oder
  Import;
- Production-SQL, Supabase-Migration, Repair, Restore oder sonstige
  Production-/Vercel-Schreibaktion;
- zweiter Provider oder eine Aussage zu dessen Betriebsreife;
- UI-Änderungen.

## 2. Additive Datenbankobjekte

Die Migration `supabase/schema-patch-v57.61.0-multibroker-mb3.sql` ergänzt:

| Objekt | Grain und Zweck |
| --- | --- |
| `broker_provider_capability_contracts_v2` | Provider + Providervertrag + Capability + Capabilityvertrag; bindet alle Wire-/Persistenzversionen und Provider-Caps. |
| `broker_runtime_enrollments_v2` | Tenant + Brokerkonto + Provider + Capability; Operator-owned State Machine `suspended → active → suspended/revoked`, monotone Generation. |
| `broker_operator_control_receipts_v2` | append-only, request-idempotente Operatorbefehle mit Inputdigest und Ergebnis. |
| `broker_capture_checkpoints_v2` | explizite v2-Bindung eines neuen Work Units an Provider-, Capability-, Query-, Cursor-, Response-, Raw-, Normalization- und Checkpointverträge. Keine Umdeutung alter Checkpoints. |
| `broker_capture_request_authorizations_v2` | single-use, deadlinegebundene Runtime-Requestauthority über Enrollmentgeneration, Work-Unit-CAS und Checkpoint-MAC. |
| `broker_capture_page_commits_v2` | append-only Page-Commit-Receipt mit Raw-Envelope-/Response-/Checkpointdigests. |
| `broker_runtime_authority_receipts_v2` | append-only Runtime-Auditreceipts für Requestauthority und Page Commit. |

Die Migration erzeugt keine Enrollment-, Checkpoint-, Request- oder
Page-Commit-Zeile. Die vier bestehenden MEXC-Read-Capabilities werden nur als
versionierte Registryeinträge gespiegelt; die bestehenden Provider-, Konto-,
Activation-, Work-Unit-, Raw- und v1/v2-RPC-Daten bleiben unverändert.

## 3. Authority-Trennung

`equora_broker_operator_control_v2` und `equora_broker_runtime_v2` sind
`NOSUPERUSER`, `NOCREATEDB`, `NOCREATEROLE`, `NOLOGIN`, `NOINHERIT`,
`NOREPLICATION` und `NOBYPASSRLS`; Role-Config, Passwort, Ablaufzeit und
abweichendes Connection-Limit sind nicht zulässig.

- Operator-Control besitzt Registry, Enrollment und Operatorreceipts sowie
  ausschließlich `equora_apply_broker_operator_command_v2`.
- Runtime besitzt Checkpoints, Request-/Page-/Runtimereceipts sowie
  ausschließlich `equora_authorize_provider_capture_request_v2` und
  `equora_commit_provider_capture_page_v2`.
- `service_role` erhält nur `EXECUTE` auf die beiden Runtime-RPCs, niemals auf
  den Operator-RPC und niemals direkte DML auf Registry, Enrollment,
  Checkpoints oder Receipts.
- Der TypeScript-Adapter stellt für alle drei RPCs ausschließlich explizit
  injizierte Client-Seams bereit; das Modul importiert oder entdeckt selbst
  weder einen Supabase-Client noch Credentials oder Transport. Insbesondere
  gibt es keinen Service-Role-Convenience-Export, der einen grundsätzlich
  unberechtigten Operatoraufruf vortäuscht.
- `PUBLIC`, `anon` und `authenticated` erhalten keine DML- oder RPC-Autorität.
  `authenticated` darf tenantbezogene Receipts nur über RLS lesen.
- Die Runtime kann deshalb ihre Registry nicht erweitern, sich nicht enrollen,
  nicht entsuspendieren und keine Generation erhöhen.
- Die Runtime besitzt auch kein direktes Registry-`SELECT`. Beide Runtime-RPCs
  lesen den exakten Registryeintrag ausschließlich über einen operator-owned
  `SECURITY DEFINER`-Helper mit `FOR SHARE`; der Lock bleibt bis zum Ende der
  aufrufenden Transaktion bestehen. Damit können Status, Generation und
  Contractpins zwischen Authorityprüfung und Commit nicht unbemerkt driften.
- Helper, Operator-RPC und beide Runtime-RPCs bilden im `public`-Schema eine
  exakte Vier-Signaturen-Menge. Zusätzliche Overloads, andere `prokind`-Werte,
  Owner-/`SECURITY DEFINER`-/`search_path`- oder signaturspezifische ACL-Drifts
  werden vom Terminalverifier abgewiesen. Der Datenbankverifier attestiert
  bewusst keinen separaten `pg_get_functiondef`-Bodydigest; die vollständigen
  Funktionsdefinitionen sind stattdessen lokal durch SQL-Artefakthash, Manifest
  und Review gebunden. Eine deployed Definitionstreue ist damit kein MB3-Claim.
- Der Terminalverifier bindet alle Rollenattribute und Role-Configs sowie den
  vollständigen Satz der 20 MB3-RLS-Policies einschließlich Schema, Tabelle,
  Name, Rollen, Kommando, Permissivität, `USING` und `WITH CHECK`.

## 4. Operator-State-Machine

Der Operator-RPC akzeptiert nur die Aktionen `enroll`, `resume`, `suspend`
und `revoke` unter `equora-provider-operator-command-v2`.

- `enroll` verlangt Generation `0`, erzeugt ausschließlich `suspended` und
  kann deshalb Runtime nie implizit aktivieren.
- `resume`, `suspend` und `revoke` verlangen exakt die aktuelle Generation und
  erhöhen sie um eins.
- Ein wiederholtes `command_id` mit identischem serverberechnetem Digest gibt
  dasselbe Receipt zurück; abweichender Replay scheitert.
- Die Kontoquoten zählen `count(distinct broker_account_id)`, nicht die
  capability-granularen Enrollmentzeilen. Ein Konto darf daher mehrere
  registrierte Capabilities tragen, ohne mehrfach als Konto zu zählen.
- MEXC bleibt durch die Registry auf ein Konto je Tenant begrenzt; der globale
  Vertrag begrenzt aktive oder suspendierte Konten auf vier. Ein
  tenantgebundener Advisory-Transaction-Lock serialisiert konkurrierende
  `enroll`-Befehle vor beiden Quotenzählungen. Die separate Capabilityquote
  bleibt capability-granular.
- Jeder Befehl wird mit unveränderlichem Inputdigest und Ergebnis gereceiptet.

## 5. Runtime-Request und Page Commit

Der neue Runtimepfad setzt eine explizit vorab materialisierte v2-Checkpoint-
Binding voraus. Fehlt Registry, Enrollment, Activation, Scope, Work Unit,
Checkpoint oder eine Version, scheitert er vor jeder Produktwirkung.

Lockreihenfolge beider Runtime-RPCs:

1. transaktionsgebundene globale Runtime-Objekt-ID-Guards vor dem ersten
   Replay-Read. Request Authorization sperrt seine Authorization-/Receipt-ID;
   Page Commit sperrt Request-Authorization-ID und Page-Commit-/Receipt-ID in
   lexikographischer UUID-Reihenfolge. Beide RPCs verwenden dieselbe
   Namespace-Domäne, sodass auch Cross-Action-Kollisionen serialisiert sind;
2. Enrollment;
3. Capability Registry über den operator-owned
   `SECURITY DEFINER`-Helper mit `FOR SHARE`; der Registry-Row-Lock bleibt
   bis zum Ende der aufrufenden Transaktion bestehen;
4. Brokerkonto;
5. Activation;
6. Scope;
7. Work Unit;
8. Integritätsschlüssel;
9. Checkpoint;
10. Requestauthorization.

Nach einem möglichen ID-Guard-Wait wird der Idempotency-/Replayzustand neu aus
der Datenbank gelesen. Der Authorization-RPC misst die Zeit direkt nach dem
Guard sowie erneut nach allen späteren potentiell blockierenden Locks und vor
seinem ersten Durable Effect. Der Page-RPC nimmt beide Guards vor dem
Page-Replay-Read und misst die Zeit nach seinem finalen Authorization-Row-Lock
sowie unmittelbar vor dem ersten Durable Effect. Beide RPCs prüfen die Zeit
zusätzlich nach dem ersten Insert erneut: dessen direkter `auth.users`-FK kann
noch nach der Pre-Insert-Probe warten. Ein dann abgelaufenes Zeit- oder
Keyfenster wirft und rollt den Insert vollständig zurück; der dabei erworbene
Parent-Key-Lock verhindert einen zweiten `auth.users`-Wait beim Receipt. Die
gemeinsame Namespace-Domäne verhindert daneben spekulative
PK-/Unique-/Receipt-Waits zwischen den beiden Runtime-RPCs.

Die Requestauthorization bindet Enrollmentgeneration, Work-Unit-Row-Version,
Requestsequenz, Page-Scope-Digest, Querydigest, Checkpointgeneration/-MAC,
vollständige Contractversionen, einen serverberechneten Digest über den
vollständigen Registry-Snapshot, den transaktionsstabil gesperrten aktuellen
Registryzustand, Requestplandigest und Deadline. Läuft eine
ausgestellte Authorization ungenutzt ab, wird sie mit serverseitigem Grund
widerrufen; eine neue Request-ID kann für dieselbe Sequenz einen monotonen
`authorization_attempt` erhalten. Eine gleichzeitig ausgestellte
Authorization je Work Unit/Sequenz bleibt durch einen partiellen Unique-Index
erzwungen.

Der Page Commit:

- verbraucht dieselbe Authorization genau einmal;
- revalidiert Enrollment, Parents, vollständige Versionpins und CAS;
- verifiziert aktuellen und nächsten Checkpoint-MAC mit Domain Separation über
  Provider, Providervertrag, Capability, Capabilityvertrag und
  Checkpointvertrag;
- verlangt genau `checkpoint_generation + 1` und `row_version + 1`;
- bindet ein secretfreies Raw-Envelope-Metadatenobjekt und dessen TCJ-Digest;
- akzeptiert Raw-Metadaten nur bei expliziten JSON-Stringtypen; JSON `null`
  oder fehlende Felder scheitern geschlossen. `observedAtUtc` ist ein realer,
  kanonischer UTC-Zeitpunkt mit null bis sechs Nachkommastellen und muss
  zwischen Erzeugung und Deadline der Requestauthorization sowie `now()`
  liegen;
- bindet die nullbasierte ausgeführte `pageSequence` an Requestsequenz,
  aktuellen Checkpoint und den exakt folgenden beziehungsweise terminal
  beibehaltenen Checkpoint. Ein interner, versionierter Cursorvalidator hält
  den registrierten MEXC-Page-Number-Cursor kanonisch `null`; der
  providerneutrale Vertrag `equora_opaque_scalar_cursor_v1` erlaubt dagegen
  `null`, nichtleere UTF-8-Strings bis 1024 Byte oder sichere Ganzzahlen und
  ermöglicht damit einen zweiten Read-only-Provider ohne Änderung des
  generischen Page-Commit-RPC;
- persistiert Receipt, Checkpointfortschritt und Work-Unit-CAS atomar;
- erzwingt die geschlossene Completeness-Matrix
  `continue|complete → unverified`, `partial → partial`, `blocked → failed`;
  das vom Caller gelieferte Work-Unit-ID-Feld muss exakt mit der gebundenen
  Authorization übereinstimmen;
- setzt `normalization_contract_version` unverändert auf
  `blocked_pending_versioned_normalization`;
- besitzt keine Reconciliation-, Approval- oder Importautorität.

## 6. Kompatibilitätsgrenze

- Alte MEXC-RPCs und ihre Funktionsdefinitionen bleiben byte-/digestprüfbar.
- Historische MEXC-Checkpoints werden nicht in v2-Zeilen kopiert oder
  umgedeutet.
- Old App/New Schema bleibt bei Runtime `off` funktionsidentisch.
- New App/Old Schema erhält für den fehlenden v2-RPC einen geschlossenen
  Schemafehler; der serverseitige TypeScript-Vertrag klassifiziert ihn als
  `schema_unavailable` und führt weder Credentialloader noch Egress aus.
- Rollback ist alte App plus additives Schema bei Runtime `off`. Ein
  destruktiver Downgrade ist nicht vorgesehen; Reparaturen sind forward-only.

## 7. Lokale Gate-Matrix

Die sechs ausführbaren Entry-Points sind:

```text
tests/sql/run-multibroker-mb3-fresh.ps1
tests/sql/run-multibroker-mb3-upgrade.ps1
tests/sql/run-multibroker-mb3-compatibility.ps1
tests/sql/run-multibroker-mb3-partial-failure.ps1
tests/sql/run-multibroker-mb3-drift.ps1
tests/sql/run-multibroker-mb3-concurrency.ps1
```

Alle Datenbanken müssen mit dem Präfix `equora_mb3_` benannt sein und sind
disposable. Die Runner dürfen ausschließlich den lokalen Docker-PostgreSQL-
Container verwenden. Vor jedem Lauf attestiert der gemeinsame Harness den
lokalen Docker-Context/-Host, die konkrete Container-ID, das exakte
Repository-Image-Digest, PostgreSQL 17.6 und `networkMode=none`. Nach jedem
Lauf werden Testdatenbank, beide MB3-Rollen und sämtliche zugehörigen
Memberships entfernt und ihre Abwesenheit geprüft. Die Runner dürfen keinen
Supabase-, Provider- oder sonstigen externen Endpoint aufrufen.

Die Matrix prüft:

- Fresh-Apply, Re-run und exakt ein MB3-Migrationsreceipt;
- Upgrade von exakt sieben v57.61.0-Receipts und unveränderte v1-Funktions- und
  Legacy-Evidence-Digests;
- Old App/New Schema und New App/Old Schema;
- transaktionalen Failpoint, vollständigen Rollback und Roll-forward-Recovery;
- Registry-, Marker-, vollständige Rollenattribut-/Role-Config-, ACL-,
  exakte RLS-Policy- einschließlich zusätzlicher `TO PUBLIC`-Policy-, FK-,
  Index- und Funktionsownerdrift;
- Operator-CAS, Replay, Suspend/Resume/Revoke;
- parallele, tenantserialisierte Enrollmentquote, parallele
  Operatorgeneration, transaktionsstabile Registryauthority gegen parallele
  Status-/Generationsdrift, frische Request-/Page-/Replay-Deadlineprüfung nach
  dem jeweils letzten blockierenden Row-Lock, globale Request-/Page-/Receipt-
  ID-Kollisionen über verschiedene Work Units und Actions mit Rollback nach
  Deadline, blockierende direkte `auth.users`-FK-Prüfungen mit
  Post-Insert-Rollback nach Deadline sowie parallelen Page-Commit-CAS;
- direkte DML-/RPC-Negativtests für `PUBLIC`, `anon`, `authenticated`,
  `service_role` und die Runtime-Authority einschließlich exakter
  Cross-Role-Tabellen-/Funktions-ACLs und zusätzlicher RPC-Overloads;
- vollständige Registry-Snapshot-/Checkpoint-/Authorization-/Page-Bindung,
  abgelaufene Authorization-Retries, versionierten MEXC-/Opaque-Scalar-
  Cursordispatch, Raw-JSON-Null-/Ganzsekunden-/Zeitgrenzen und widersprüchliche
  Completenesszustände.

## 8. Gate- und Freigabegrenze

Der MB3-Kandidat ist erst lokal reviewfähig, wenn alle sechs SQL-Entry-Points,
gezielte TypeScript-/SQL-Contracttests, Typecheck, vollständige Testsuite,
Release-Check und Build tatsächlich bestanden und die vollständige, im
Validator als `REQUIRED_ATTEMPTS` versionierte Gate-Transcriptmenge hashgebunden
im MB3-Evidenceartefakt erfasst ist. Das Manifest bindet Evidence plus 14
normative Inputs als 15 kanonische Einträge. Der terminale Manifestvalidator
muss zusätzlich 15/15 Inputs und sämtliche `REQUIRED_ATTEMPTS` bestätigen;
dieser no-exception-Lauf ist wegen der Selbstreferenz eine separate lokale
Beobachtung und wird nicht rekursiv als eigener hashgebundener Attempt in
dasselbe Evidenceartefakt eingebettet. Eine feste Gesamtzahl im Vertrag ist
bewusst ausgeschlossen, weil jede append-only Remediation die Menge erweitert.

Ein lokaler PASS autorisiert weder Staging noch GitHub noch Production. Ready-
for-Review ist erst nach einem identischen A3-/A4-/A5-Review ohne offene P0–P2
zulässig. Squash-Merge, Production-Deployment und jede Supabase-/Brokeraktion
bleiben getrennte spätere Gates.
