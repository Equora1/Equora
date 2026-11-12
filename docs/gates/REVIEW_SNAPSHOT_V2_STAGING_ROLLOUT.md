# Review snapshots v2: Staging installation and application rollout

Status: 2026-10-18. The additive database patch is installed on **Equora Staging**, project `pgxypexyaepqlfskkscx`. The application changes require their own Preview publication and authenticated acceptance. This record does not authorize another database execution, Main merge, or Production rollout.

## Versioned SQL and actual installation

`supabase/schema-patch-v57.62.0-review-snapshot-v2.sql` records the exact SQL supplied to the Staging SQL editor. Its original local-candidate header is retained as part of the frozen source; the separately approved installation and its result are recorded here. This is a manually gated patch outside `supabase/migrations`; neither the Next.js build nor this document applies it.

SHA-256 of the exact applied file bytes: `4F0A815FE3A9412F50B03B34262857391A99A21DC4A2139DB4290ACBC4337D81`. Git may normalize CRLF/LF; compare normalized line endings separately from exact applied-byte hashes. No SQL tokens may change under that comparison.

The unchanged functional core, SHA-256 `A1F5263240AAB5590E9CC0D844F0CF1AC31C2D64DC9172EEF6B316C8CFBB9C89`, passed the separately authorized 92-case synthetic PostgreSQL run. The only installation wrapper additions set local `lock_timeout=3s`, `statement_timeout=30s`, and `idle_in_transaction_session_timeout=15s`. The runtime evidence received separate A3/A4/A5 reviews; this is AI review, not independent human acceptance.

The user approved one Staging transaction with fresh catalog/settings checks and a read-only postflight. The refreshed catalog matched the captured baseline; the additional settings query confirmed READ COMMITTED. The migration returned `Success. No rows returned`. The postflight at `2026-10-17T22:19:44.598751Z` confirmed exactly three nullable, default-free columns and two new functions. This is 18 October in Europe/Berlin. No historical rows were rewritten or review RPC invoked. The full local evidence manifest has SHA-256 `0548C32DCD9B2250BA4545EAE73D62D56A005E908AE398C85D801C2E2B890375`; its 37 file bindings and a focused A4 migration-evidence review passed.

Installed columns on `public.review_sessions`: `calculation_version text`, `r_count integer`, `excluded_r_count integer`. Both new functions are postgres-owned, SECURITY DEFINER, VOLATILE, with empty `search_path`. The commit function additionally uses `lock_timeout=3s`. Effective EXECUTE is false for `anon` and `authenticated`, true for `service_role`; browser INSERT/UPDATE on the new columns is denied.

| Function | Observed Staging body SHA-256 (CRLF) | Equivalent frozen LF body SHA-256 |
| --- | --- | --- |
| `equora_review_source_v2(uuid,uuid[])` | `ac620d0be1d1896e2e2299857ce8992c089b2d6bc813c01c492341771c190ea1` | `4de60249db3551181dc1544c4e0f576b511e26dc99269571d476491332f0eab8` |
| `equora_commit_review_snapshot_v2(uuid,uuid,uuid[],text,jsonb,jsonb)` | `cc4a5a5e38c27c18600976891208d54d910d67b6bb94bcf7a9e1375bba827fe6` | `7d8e13fd6ee1e26a633460f5f2662f1eef40e02d99c74f0670677474bb8a9365` |

Existing columns/rights, policies, constraints, default ACLs, roles, trigger catalog and `equora_save_review_session_v1` were unchanged. Its observed body SHA-256 remains `3876fbfe13d83d0cfc1af916b06c5587ab7d0a5e7c2d6e653d34aebeeb6aaa43`.

## Application contract and acceptance

The authenticated action passes the current user and normalized selection to the server-only helper. The helper reads complete owned trade/tag rows through the service-only source function, computes the same summary used by the live Review, and submits the original database-produced source text. The commit function rechecks it under fixed SHARE locks before insertion. Only READ COMMITTED is accepted. No v1 fallback or automatic commit retry is introduced. Selection is limited to 2,000 distinct trade IDs; the error explains this limit.

Missing R remains unavailable; documented zero remains an observation. New saved reviews carry the calculation version and included/excluded R counts. Historical reviews retain their original values and are not represented as verified current calculations. A source change requires a fresh Review; an unconfirmed commit requires checking the collection before any manual retry.

For the next Preview, keep the existing staging-specific environment and protected branch alias. After successful CI/deployment, verify the real signed-in save/read path and schema-cache behavior through the application. Creating a Staging Review is a separate, explicit acceptance action; do not infer that permission from a read-only check. Preserve its result for comparison and do not delete test data without authorization.

SHARE locks affect all writers to the relevant tables while held. The local parallelism/timeout/deadlock cases passed, but Hosted load/latency and the actual service-role HTTP context remain unaccepted. `JRN-R-SAVED-REVIEW-01` remains open until coordinated application rollout and real Staging save/read acceptance. Historical partial-exit price provenance remains a separate limitation.

## Retry and rollback boundaries

Do not rerun the installed SQL: it rejects already-existing v2 functions and requires separate drift review. A failure is a STOP, not permission to relax guards or change global ACLs. No automatic migration retry is authorized. Preserve the additive schema if the app publication is held; the older app can continue using v1 and creates legacy reviews. Rolling the app back does not repair the old missing-average semantics and is not a final resolution. No destructive down migration, historic data conversion, key change, B1 activation, broker/Cron/import action, Main merge, or Production change is included.
