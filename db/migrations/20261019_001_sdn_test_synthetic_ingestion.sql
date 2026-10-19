-- SDN-004: private synthetic ingestion and provenance proof.
-- Test fixtures only. This is not a live synchronization path.

begin;

create schema if not exists sdn_test;

comment on schema sdn_test is
    'Private CoMind SDN Test fixtures only. No live or production records.';

revoke all on schema sdn_test from public;

do $revoke_roles$
declare
    v_role text;
begin
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
        if exists (select 1 from pg_roles where rolname = v_role) then
            execute format('revoke all on schema sdn_test from %I', v_role);
        end if;
    end loop;
end;
$revoke_roles$;

do $extension_guard$
begin
    if not exists (
        select 1
        from pg_extension e
        join pg_namespace n on n.oid = e.extnamespace
        where e.extname = 'pgcrypto'
          and n.nspname = 'extensions'
    ) then
        raise exception 'SDN-004 requires pgcrypto already installed in schema extensions';
    end if;
end;
$extension_guard$;

create or replace function sdn_test.canonical_json_text(p_value jsonb)
returns text
language plpgsql
immutable
strict
set search_path = pg_catalog, sdn_test
as $function$
declare
    v_result text;
begin
    case jsonb_typeof(p_value)
        when 'object' then
            select '{' || coalesce(
                string_agg(
                    to_json(k.key)::text || ':' || sdn_test.canonical_json_text(k.value),
                    ',' order by k.key collate "C"
                ),
                ''
            ) || '}'
            into v_result
            from jsonb_each(p_value) as k(key, value);
            return v_result;
        when 'array' then
            select '[' || coalesce(
                string_agg(sdn_test.canonical_json_text(a.value), ',' order by a.ordinality),
                ''
            ) || ']'
            into v_result
            from jsonb_array_elements(p_value) with ordinality as a(value, ordinality);
            return v_result;
        else
            return p_value::text;
    end case;
end;
$function$;

create or replace function sdn_test.canonical_payload_sha256(p_value jsonb)
returns text
language sql
immutable
set search_path = pg_catalog, sdn_test, extensions
as $function$
    select encode(
        extensions.digest(
            convert_to(sdn_test.canonical_json_text(p_value), 'UTF8'),
            'sha256'
        ),
        'hex'
    );
$function$;

create or replace function sdn_test.canonical_event_sha256(
    p_event_type text,
    p_lifecycle_class text,
    p_policy_version text,
    p_payload jsonb,
    p_source_event_record_id uuid,
    p_provenance_relation text
)
returns text
language sql
immutable
set search_path = pg_catalog, sdn_test, extensions
as $function$
    select encode(
        extensions.digest(
            convert_to(
                sdn_test.canonical_json_text(
                    jsonb_build_object(
                        'event_type', p_event_type,
                        'lifecycle_class', p_lifecycle_class,
                        'policy_version', p_policy_version,
                        'payload', p_payload,
                        'source_event_record_id', p_source_event_record_id,
                        'provenance_relation', p_provenance_relation
                    )
                ),
                'UTF8'
            ),
            'sha256'
        ),
        'hex'
    );
$function$;

create table if not exists sdn_test.synthetic_event (
    event_record_id uuid primary key default gen_random_uuid(),
    producer_id uuid not null,
    producer_event_id text not null check (btrim(producer_event_id) <> ''),
    event_type text not null check (btrim(event_type) <> ''),
    lifecycle_class text not null check (lifecycle_class in ('A', 'C', 'D', 'E')),
    policy_version text not null check (btrim(policy_version) <> ''),
    payload jsonb not null check (jsonb_typeof(payload) = 'object'),
    payload_sha256 text not null,
    content_sha256 text not null,
    is_synthetic boolean not null default true check (is_synthetic is true),
    ingested_at timestamptz not null default transaction_timestamp(),
    constraint synthetic_event_identity_uq unique (producer_id, producer_event_id),
    constraint synthetic_event_payload_hash_ck check (
        payload_sha256 = sdn_test.canonical_payload_sha256(payload)
    )
);

create table if not exists sdn_test.provenance_edge (
    provenance_edge_id uuid primary key default gen_random_uuid(),
    source_event_record_id uuid not null references sdn_test.synthetic_event(event_record_id),
    derived_event_record_id uuid not null references sdn_test.synthetic_event(event_record_id),
    relation text not null check (btrim(relation) <> ''),
    created_at timestamptz not null default transaction_timestamp(),
    constraint provenance_edge_not_self_ck check (source_event_record_id <> derived_event_record_id),
    constraint provenance_edge_identity_uq unique (
        source_event_record_id,
        derived_event_record_id,
        relation
    )
);

create table if not exists sdn_test.integrity_conflict (
    conflict_id uuid primary key default gen_random_uuid(),
    event_record_id uuid not null references sdn_test.synthetic_event(event_record_id),
    attempted_payload jsonb not null check (jsonb_typeof(attempted_payload) = 'object'),
    attempted_payload_sha256 text not null,
    attempted_content_sha256 text not null,
    observed_at timestamptz not null default transaction_timestamp(),
    constraint integrity_conflict_attempt_uq unique (event_record_id, attempted_content_sha256),
    constraint integrity_conflict_payload_hash_ck check (
        attempted_payload_sha256 = sdn_test.canonical_payload_sha256(attempted_payload)
    )
);

create or replace function sdn_test.reject_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, sdn_test
as $function$
begin
    raise exception 'SDN Test evidence is append-only';
end;
$function$;

drop trigger if exists synthetic_event_no_update on sdn_test.synthetic_event;
create trigger synthetic_event_no_update
before update or delete on sdn_test.synthetic_event
for each row execute function sdn_test.reject_mutation();

drop trigger if exists provenance_edge_no_update on sdn_test.provenance_edge;
create trigger provenance_edge_no_update
before update or delete on sdn_test.provenance_edge
for each row execute function sdn_test.reject_mutation();

drop trigger if exists integrity_conflict_no_update on sdn_test.integrity_conflict;
create trigger integrity_conflict_no_update
before update or delete on sdn_test.integrity_conflict
for each row execute function sdn_test.reject_mutation();

alter table sdn_test.synthetic_event enable row level security;
alter table sdn_test.provenance_edge enable row level security;
alter table sdn_test.integrity_conflict enable row level security;

create or replace function sdn_test.ingest_synthetic_event(
    p_producer_id uuid,
    p_producer_event_id text,
    p_event_type text,
    p_lifecycle_class text,
    p_policy_version text,
    p_payload jsonb,
    p_source_event_record_id uuid default null,
    p_provenance_relation text default null
)
returns table(outcome text, event_record_id uuid, payload_sha256 text)
language plpgsql
set search_path = pg_catalog, sdn_test
as $function$
declare
    v_record_id uuid;
    v_existing sdn_test.synthetic_event%rowtype;
    v_payload_sha256 text;
    v_content_sha256 text;
begin
    if p_producer_id is null
       or p_producer_event_id is null
       or btrim(p_producer_event_id) = ''
       or p_event_type is null
       or btrim(p_event_type) = ''
       or p_lifecycle_class is null
       or p_lifecycle_class not in ('A', 'C', 'D', 'E')
       or p_policy_version is null
       or btrim(p_policy_version) = ''
       or p_payload is null
       or jsonb_typeof(p_payload) <> 'object'
    then
        raise exception 'invalid synthetic SDN event';
    end if;

    if (p_source_event_record_id is null) <> (p_provenance_relation is null)
       or (p_provenance_relation is not null and btrim(p_provenance_relation) = '')
    then
        raise exception 'source event and provenance relation must be supplied together';
    end if;

    v_payload_sha256 := sdn_test.canonical_payload_sha256(p_payload);
    v_content_sha256 := sdn_test.canonical_event_sha256(
        p_event_type,
        p_lifecycle_class,
        p_policy_version,
        p_payload,
        p_source_event_record_id,
        p_provenance_relation
    );

    insert into sdn_test.synthetic_event (
        producer_id, producer_event_id, event_type, lifecycle_class,
        policy_version, payload, payload_sha256, content_sha256
    ) values (
        p_producer_id, p_producer_event_id, p_event_type, p_lifecycle_class,
        p_policy_version, p_payload, v_payload_sha256, v_content_sha256
    )
    on conflict (producer_id, producer_event_id) do nothing
    returning sdn_test.synthetic_event.event_record_id into v_record_id;

    if v_record_id is not null then
        if p_source_event_record_id is not null then
            insert into sdn_test.provenance_edge (
                source_event_record_id, derived_event_record_id, relation
            ) values (
                p_source_event_record_id, v_record_id, p_provenance_relation
            );
        end if;
        return query select 'accepted'::text, v_record_id, v_payload_sha256;
        return;
    end if;

    select e.* into v_existing
    from sdn_test.synthetic_event e
    where e.producer_id = p_producer_id
      and e.producer_event_id = p_producer_event_id
    for update;

    if v_existing.content_sha256 = v_content_sha256 then
        return query select 'replayed'::text, v_existing.event_record_id, v_existing.payload_sha256;
        return;
    end if;

    insert into sdn_test.integrity_conflict (
        event_record_id, attempted_payload,
        attempted_payload_sha256, attempted_content_sha256
    ) values (
        v_existing.event_record_id, p_payload,
        v_payload_sha256, v_content_sha256
    )
    on conflict on constraint integrity_conflict_attempt_uq do nothing;

    return query select 'conflict'::text, v_existing.event_record_id, v_existing.payload_sha256;
end;
$function$;

do $revoke_objects$
declare
    v_role text;
begin
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
        if exists (select 1 from pg_roles where rolname = v_role) then
            execute format('revoke all on all tables in schema sdn_test from %I', v_role);
            execute format('revoke all on all sequences in schema sdn_test from %I', v_role);
            execute format('revoke all on all functions in schema sdn_test from %I', v_role);
        end if;
    end loop;
end;
$revoke_objects$;

revoke all on all tables in schema sdn_test from public;
revoke all on all sequences in schema sdn_test from public;
revoke all on all functions in schema sdn_test from public;

commit;
