-- psql-only deployment driver for an existing Equora v57.60.1 database.
-- It performs no backup, no broker request and no runtime activation.
-- A complete exact six-marker installation is idempotently skipped. Any
-- one-to-five-marker partial installation is restore-only and is rejected by
-- the mandatory preflight before this driver can run.
\set ON_ERROR_STOP on

\if :{?equora_v5761_preflight_ok}
  \if :equora_v5761_preflight_ok
  \else
    \echo 'NO-GO: Deployment benÃ¶tigt einen erfolgreichen Preflight in derselben psql-Sitzung.'
    do $fail$ begin raise exception 'DEPLOY_PREFLIGHT_EVIDENCE_MISSING'; end $fail$;
  \endif
\else
  \echo 'NO-GO: Deployment benÃ¶tigt einen erfolgreichen Preflight in derselben psql-Sitzung.'
  do $fail$ begin raise exception 'DEPLOY_PREFLIGHT_EVIDENCE_MISSING'; end $fail$;
\endif

\set migration_table_present false
select to_regclass('equora_private.schema_migrations') is not null
  as migration_table_present
\gset
\if :migration_table_present
  select count(*) = 1 as capture_marker_present,
    (
      count(*) = 0
      or (
        count(*) = 1
        and bool_and(contract_fingerprint =
          '492ebad5496806ad60425abd58e9801c58a58b421e38392d54e6082d7fa2b083')
      )
    ) as capture_marker_valid
  from equora_private.schema_migrations
  where migration_id = 'equora_v57.61.0_broker_capture_v1'
  \gset
\else
  \set capture_marker_present false
  \set capture_marker_valid true
\endif
\if :capture_marker_valid
\else
  \echo 'NO-GO: Capture-Persistence-Marker besitzt einen unbekannten Fingerprint.'
  do $fail$ begin raise exception 'DEPLOY_CAPTURE_MARKER_DRIFT'; end $fail$;
\endif
\if :capture_marker_present
  \echo 'Equora v57.61.0: 1/6 capture persistence already exact; skip'
\else
  \echo 'Equora v57.61.0: 1/6 capture persistence'
  \ir schema-patch-v57.61.0.sql
\endif

select count(*) = 1 as control_marker_present,
  (
    count(*) = 0
    or (
      count(*) = 1
      and bool_and(contract_fingerprint =
        'c133d5e0c987e7f927963db4465ef5ab2f6f4c174cfdc96a3ed1cffb5cd62be5')
    )
  ) as control_marker_valid
from equora_private.schema_migrations
where migration_id = 'equora_v57.61.0_g1_capture_control_v1'
\gset
\if :control_marker_valid
\else
  \echo 'NO-GO: Capture-Control-Marker besitzt einen unbekannten Fingerprint.'
  do $fail$ begin raise exception 'DEPLOY_CONTROL_MARKER_DRIFT'; end $fail$;
\endif
\if :control_marker_present
  \echo 'Equora v57.61.0: 2/6 capture control already exact; skip'
\else
  \echo 'Equora v57.61.0: 2/6 capture control'
  \ir schema-patch-v57.61.0-g1-capture-control.sql
\endif

select count(*) = 1 as lane_marker_present,
  (
    count(*) = 0
    or (
      count(*) = 1
      and bool_and(contract_fingerprint =
        '6be313155e81e0f14c48d0c71301e28a75b792a90e49542bc49ffe638f56c68d')
    )
  ) as lane_marker_valid
from equora_private.schema_migrations
where migration_id = 'equora_v57.61.0_g1_lane_authority_v1'
\gset
\if :lane_marker_valid
\else
  \echo 'NO-GO: Lane-Authority-Marker besitzt einen unbekannten Fingerprint.'
  do $fail$ begin raise exception 'DEPLOY_LANE_MARKER_DRIFT'; end $fail$;
\endif
\if :lane_marker_present
  \echo 'Equora v57.61.0: 3/6 lane authority already exact; skip'
\else
  \echo 'Equora v57.61.0: 3/6 lane authority'
  \ir schema-patch-v57.61.0-g1-lane-authority.sql
\endif

select count(*) = 1 as activation_marker_present,
  (
    count(*) = 0
    or (
      count(*) = 1
      and bool_and(contract_fingerprint =
        'b074a756a015b34a7e3da804f3d3955100a40f9a6391855a75c1e415cbbb2abb')
    )
  ) as activation_marker_valid
from equora_private.schema_migrations
where migration_id = 'equora_v57.61.0_g1_activation_authority_v1'
\gset
\if :activation_marker_valid
\else
  \echo 'NO-GO: Activation-Authority-Marker besitzt einen unbekannten Fingerprint.'
  do $fail$ begin raise exception 'DEPLOY_ACTIVATION_MARKER_DRIFT'; end $fail$;
\endif
\if :activation_marker_present
  \echo 'Equora v57.61.0: 4/6 activation authority already exact; skip'
\else
  \echo 'Equora v57.61.0: 4/6 activation authority'
  \ir schema-patch-v57.61.0-g1-activation-authority.sql
\endif

select count(*) = 1 as scheduler_marker_present,
  (
    count(*) = 0
    or (
      count(*) = 1
      and bool_and(contract_fingerprint =
        '87158546782b900817d3f36501a2e43b5619906a2f07636d0cb1167b042e5ab7')
    )
  ) as scheduler_marker_valid
from equora_private.schema_migrations
where migration_id = 'equora_v57.61.0_g1_scheduler_control_v2'
\gset
\if :scheduler_marker_valid
\else
  \echo 'NO-GO: Scheduler-Control-Marker besitzt einen unbekannten Fingerprint.'
  do $fail$ begin raise exception 'DEPLOY_SCHEDULER_MARKER_DRIFT'; end $fail$;
\endif
\if :scheduler_marker_present
  \echo 'Equora v57.61.0: 5/6 scheduler control already exact; skip'
\else
  \echo 'Equora v57.61.0: 5/6 scheduler control'
  \ir schema-patch-v57.61.0-g1-scheduler-control.sql
\endif

select count(*) = 1 as runtime_marker_present,
  (
    count(*) = 0
    or (
      count(*) = 1
      and bool_and(contract_fingerprint =
        '892f1587e8e37937a538dad1239ec931d43bd1f65d2f224d56ab7b9356f89e96')
    )
  ) as runtime_marker_valid
from equora_private.schema_migrations
where migration_id = 'equora_v57.61.0_g1_runtime_deployment_v1'
\gset
\if :runtime_marker_valid
\else
  \echo 'NO-GO: Runtime-Deployment-Marker besitzt einen unbekannten Fingerprint.'
  do $fail$ begin raise exception 'DEPLOY_RUNTIME_MARKER_DRIFT'; end $fail$;
\endif
\if :runtime_marker_present
  \echo 'Equora v57.61.0: 6/6 deployment runtime authority already exact; skip'
\else
  \echo 'Equora v57.61.0: 6/6 deployment runtime authority'
  \ir schema-patch-v57.61.0-g1-runtime-deployment.sql
\endif

\echo 'Equora v57.61.0 SQL stack applied or vollständig idempotent bestätigt; Runtime bleibt environment-gated.'
