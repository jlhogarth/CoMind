-- SDN-004 contract proof. All fixture rows are rolled back at the end.
\set ON_ERROR_STOP on

begin;

do $verify$
declare
    v_producer_id constant uuid := 'd4733a10-46c9-4fcf-8b4a-7fbbaf3d7b01';
    v_root_id uuid;
    v_replay_id uuid;
    v_conflict_id uuid;
    v_child_id uuid;
    v_outcome text;
    v_hash text;
    v_expected_hash constant text := '45c93ccb331be973cb48ac30b18fc73293eb0a6800cf63ec996ba6a28801d039';
    v_payload constant jsonb := '{"z":9,"a":{"y":true,"x":"test"}}'::jsonb;
    v_changed_payload constant jsonb := '{"z":10,"a":{"y":true,"x":"test"}}'::jsonb;
    v_update_rejected boolean := false;
    v_role text;
    v_event_count integer;
    v_conflict_count integer;
    v_provenance_count integer;
begin
    if sdn_test.canonical_json_text(v_payload) <> '{"a":{"x":"test","y":true},"z":9}' then
        raise exception 'canonical JSON key ordering mismatch';
    end if;

    v_hash := sdn_test.canonical_payload_sha256(v_payload);
    if v_hash <> v_expected_hash then
        raise exception 'canonical payload hash mismatch: %', v_hash;
    end if;

    select outcome, event_record_id, payload_sha256
    into v_outcome, v_root_id, v_hash
    from sdn_test.ingest_synthetic_event(
        v_producer_id, 'fixture-root-001', 'synthetic.metric', 'D', 'test-policy-v1', v_payload
    );
    if v_outcome <> 'accepted' or v_hash <> v_expected_hash then
        raise exception 'first ingestion did not return the expected accepted receipt';
    end if;

    select outcome, event_record_id
    into v_outcome, v_replay_id
    from sdn_test.ingest_synthetic_event(
        v_producer_id, 'fixture-root-001', 'synthetic.metric', 'D', 'test-policy-v1',
        '{"a":{"x":"test","y":true},"z":9}'::jsonb
    );
    if v_outcome <> 'replayed' or v_replay_id <> v_root_id then
        raise exception 'exact replay did not preserve the original receipt';
    end if;

    select outcome, event_record_id
    into v_outcome, v_conflict_id
    from sdn_test.ingest_synthetic_event(
        v_producer_id, 'fixture-root-001', 'synthetic.metric', 'D', 'test-policy-v1', v_changed_payload
    );
    if v_outcome <> 'conflict' or v_conflict_id <> v_root_id then
        raise exception 'changed-payload replay was not rejected as a conflict';
    end if;

    perform sdn_test.ingest_synthetic_event(
        v_producer_id, 'fixture-root-001', 'synthetic.metric', 'D', 'test-policy-v1', v_changed_payload
    );

    select outcome, event_record_id
    into v_outcome, v_child_id
    from sdn_test.ingest_synthetic_event(
        v_producer_id, 'fixture-derived-001', 'synthetic.summary', 'D', 'test-policy-v1',
        '{"summary":"synthetic derivative"}'::jsonb, v_root_id, 'derived_from'
    );
    if v_outcome <> 'accepted' then
        raise exception 'synthetic derivative was not accepted';
    end if;

    select outcome, event_record_id
    into v_outcome, v_replay_id
    from sdn_test.ingest_synthetic_event(
        v_producer_id, 'fixture-derived-001', 'synthetic.summary', 'D', 'test-policy-v1',
        '{"summary":"synthetic derivative"}'::jsonb, v_root_id, 'derived_from'
    );
    if v_outcome <> 'replayed' or v_replay_id <> v_child_id then
        raise exception 'derived event replay did not preserve its receipt';
    end if;

    select count(*) into v_event_count
    from sdn_test.synthetic_event
    where producer_id = v_producer_id;
    select count(*) into v_conflict_count
    from sdn_test.integrity_conflict
    where event_record_id = v_root_id;
    select count(*) into v_provenance_count
    from sdn_test.provenance_edge
    where source_event_record_id = v_root_id
      and derived_event_record_id = v_child_id
      and relation = 'derived_from';

    if v_event_count <> 2 or v_conflict_count <> 1 or v_provenance_count <> 1 then
        raise exception 'fixture counts mismatch: events %, conflicts %, provenance %',
            v_event_count, v_conflict_count, v_provenance_count;
    end if;

    begin
        update sdn_test.synthetic_event
        set event_type = 'tampered'
        where event_record_id = v_root_id;
    exception when raise_exception then
        v_update_rejected := true;
    end;
    if not v_update_rejected then
        raise exception 'append-only event guard allowed an update';
    end if;

    if exists (
        select 1 from sdn_test.synthetic_event
        where event_record_id = v_root_id and event_type <> 'synthetic.metric'
    ) then
        raise exception 'event changed despite append-only guard';
    end if;

    if exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'sdn_test'
          and c.relkind = 'r'
          and not c.relrowsecurity
    ) then
        raise exception 'RLS is not enabled on every SDN Test table';
    end if;

    if exists (select 1 from pg_policies where schemaname = 'sdn_test') then
        raise exception 'unexpected policy exposes SDN Test rows';
    end if;

    if exists (
        select 1
        from pg_namespace n
        cross join lateral aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
        where n.nspname = 'sdn_test'
          and a.grantee = 0
    ) then
        raise exception 'PUBLIC has privileges on the SDN Test schema';
    end if;

    if exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        cross join lateral aclexplode(
            coalesce(c.relacl, acldefault(case when c.relkind = 'S' then 'S' else 'r' end, c.relowner))
        ) a
        where n.nspname = 'sdn_test'
          and c.relkind in ('r', 'S')
          and a.grantee = 0
    ) then
        raise exception 'PUBLIC has privileges on SDN Test tables or sequences';
    end if;

    if exists (
        select 1
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        where n.nspname = 'sdn_test'
          and a.grantee = 0
    ) then
        raise exception 'PUBLIC has execute privileges on SDN Test functions';
    end if;

    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
        if exists (select 1 from pg_roles where rolname = v_role)
           and has_schema_privilege(v_role, 'sdn_test', 'USAGE')
        then
            raise exception 'application role % has schema usage on SDN Test', v_role;
        end if;

        if exists (select 1 from pg_roles where rolname = v_role)
           and exists (
               select 1
               from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'sdn_test'
                 and c.relkind in ('r', 'S')
                 and (
                     (c.relkind = 'r' and (
                         has_table_privilege(v_role, c.oid, 'SELECT')
                         or has_table_privilege(v_role, c.oid, 'INSERT')
                         or has_table_privilege(v_role, c.oid, 'UPDATE')
                         or has_table_privilege(v_role, c.oid, 'DELETE')
                     ))
                     or (c.relkind = 'S' and (
                         has_sequence_privilege(v_role, c.oid, 'USAGE')
                         or has_sequence_privilege(v_role, c.oid, 'SELECT')
                         or has_sequence_privilege(v_role, c.oid, 'UPDATE')
                     ))
                 )
           )
        then
            raise exception 'application role % has table or sequence privileges in SDN Test', v_role;
        end if;

        if exists (select 1 from pg_roles where rolname = v_role)
           and exists (
               select 1
               from pg_proc p
               join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'sdn_test'
                 and has_function_privilege(v_role, p.oid, 'EXECUTE')
           )
        then
            raise exception 'application role % can execute SDN Test functions', v_role;
        end if;
    end loop;
end;
$verify$;

select 'pass' as verification_status,
       'canonical_hash,replay,conflict,provenance,append_only,private_acl,rls' as verified_contracts;

rollback;
