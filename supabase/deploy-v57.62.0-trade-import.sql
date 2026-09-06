\set ON_ERROR_STOP on
\pset pager off

-- This driver installs schema only. It never activates persistence.
\ir preflight-v57.62.0-trade-import.sql

\if :v5762_apply_required
  \echo 'Applying v57.62.0 trade-import persistence schema in default-off mode.'
  \ir schema-patch-v57.62.0-trade-import-hardening.sql
\else
  \echo 'Exact v57.62.0 trade-import persistence schema already present; skip.'
\endif

\ir postflight-v57.62.0-trade-import.sql
