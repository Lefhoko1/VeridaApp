-- Foundation: one Postgres schema per bounded context from the requirements (section 3).
-- Modules depend on each other only through foreign keys and published functions.

create schema if not exists identity;       -- Module A: who the user is
create schema if not exists authz;          -- Section 3.1: what the user may do
create schema if not exists audit;          -- Cross-cutting: append-only change history
create schema if not exists platform;       -- Module I: industry configuration and governance
create schema if not exists business;       -- Module B: businesses and membership
create schema if not exists records;        -- Module C: sales, expenses, products
create schema if not exists operations;     -- Module D: industry-specific operational records
create schema if not exists analytics;      -- Module E: deterministic calculations
create schema if not exists learning;       -- Module F: Verida Learn
create schema if not exists assistant;      -- Module G: Ask Verida
create schema if not exists notifications;  -- Module H: delivery and preferences

-- Functions are private unless a migration grants them explicitly. This has to be the global
-- form: per-schema default privileges cannot revoke what is granted globally to PUBLIC.
alter default privileges revoke execute on functions from public;

do $$
declare
  s text;
begin
  foreach s in array array['identity','authz','audit','platform','business','records',
                           'operations','analytics','learning','assistant','notifications']
  loop
    execute format('grant usage on schema %I to authenticated, service_role', s);
    execute format('alter default privileges in schema %I grant all on tables to service_role', s);
    execute format('alter default privileges in schema %I grant execute on functions to service_role', s);
  end loop;
end $$;

-- Audit trail (FR-C10, FR-C11, FR-I11). No client role can write to or alter this table.
create table audit.record_changes (
  id           bigint generated always as identity primary key,
  business_id  uuid,
  table_schema text        not null,
  table_name   text        not null,
  record_id    uuid,
  action       text        not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor_id     uuid,
  occurred_at  timestamptz not null default now(),
  old_data     jsonb,
  new_data     jsonb
);
create index record_changes_business_idx on audit.record_changes (business_id, occurred_at desc);
alter table audit.record_changes enable row level security;

create function audit.stamp_actor() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

create function audit.capture_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  old_row jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  new_row jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  source  jsonb := coalesce(new_row, old_row);
begin
  insert into audit.record_changes
    (business_id, table_schema, table_name, record_id, action, actor_id, old_data, new_data)
  values (
    coalesce(source ->> 'business_id', source ->> 'id')::uuid,
    tg_table_schema, tg_table_name, (source ->> 'id')::uuid, tg_op, auth.uid(), old_row, new_row
  );
  return coalesce(new, old);
end $$;

-- Attaches actor stamping and change capture to a table with the standard audit columns.
create function audit.enable_tracking(target regclass) returns void
language plpgsql set search_path = '' as $$
begin
  execute format('create trigger stamp_actor before insert or update on %s
                  for each row execute function audit.stamp_actor()', target);
  execute format('create trigger capture_change after insert or update or delete on %s
                  for each row execute function audit.capture_change()', target);
end $$;
