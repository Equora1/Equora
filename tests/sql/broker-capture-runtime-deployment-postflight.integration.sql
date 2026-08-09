\set ON_ERROR_STOP on

do $$
begin
  if has_table_privilege(
      'supabase_auth_admin',
      'public.broker_connection_setup_commands',
      'select'
    )
    or has_function_privilege(
      'supabase_auth_admin',
      'public.equora_load_broker_capture_material_v1(uuid)',
      'execute'
    )
  then
    raise exception 'RUNTIME_DEPLOYMENT_ARBITRARY_ACL_SURVIVED_RERUN';
  end if;
end;
$$;
