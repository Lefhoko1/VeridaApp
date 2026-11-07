-- Module D: industry-specific operations over one common record shape. The activity type
-- comes from platform configuration, so new industries need no new tables.

create table operations.flocks (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references business.businesses (id) on delete cascade,
  name          text not null check (length(trim(name)) between 1 and 120),
  breed         text,
  acquired_on   date,
  initial_count int  check (initial_count is null or initial_count >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid references identity.profiles (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references identity.profiles (id),
  unique (id, business_id),
  unique (business_id, name)
);

create table operations.activity_records (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references business.businesses (id) on delete cascade,
  activity_type_id uuid not null references platform.activity_types (id),
  occurred_on      date not null,
  quantity         numeric(14, 3) not null,
  unit             text not null,
  flock_id         uuid,
  notes            text,
  status           text not null default 'recorded' check (status in ('recorded', 'voided')),
  void_reason      text,
  voided_at        timestamptz,
  voided_by        uuid references identity.profiles (id),
  created_at       timestamptz not null default now(),
  created_by       uuid references identity.profiles (id),
  updated_at       timestamptz not null default now(),
  updated_by       uuid references identity.profiles (id),
  foreign key (flock_id, business_id) references operations.flocks (id, business_id) on delete restrict
);
create index activity_business_date_idx on operations.activity_records (business_id, occurred_on desc);
create index activity_type_idx on operations.activity_records (activity_type_id, occurred_on);

-- FR-I07, FR-I08: enforces the industry's configuration on every write.
create function operations.validate_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  config platform.activity_types;
begin
  select t.* into config
    from platform.activity_types t
    join business.businesses b on b.industry_code = t.industry_code
   where t.id = new.activity_type_id and b.id = new.business_id;
  if not found then
    raise exception 'This activity is not available for this type of business.' using errcode = '23514';
  end if;
  if new.quantity < 0 and not config.allows_negative then
    raise exception '% cannot be negative.', config.name using errcode = '23514';
  end if;
  return new;
end $$;

create trigger validate_activity before insert or update on operations.activity_records
  for each row execute function operations.validate_activity();

-- FR-B09: existing activity records belong to the old industry's configuration.
create function operations.guard_industry_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.industry_code is distinct from old.industry_code
     and exists (select 1 from operations.activity_records where business_id = new.id) then
    raise exception 'The business type cannot change once operational records exist.' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger guard_industry_change before update of industry_code on business.businesses
  for each row execute function operations.guard_industry_change();

select audit.enable_tracking('operations.flocks');
select audit.enable_tracking('operations.activity_records');

alter table operations.flocks enable row level security;
alter table operations.activity_records enable row level security;

create policy flocks_read on operations.flocks for select to authenticated
  using (authz.has_business_permission(business_id, 'records.view'));
create policy flocks_insert on operations.flocks for insert to authenticated
  with check (authz.has_business_permission(business_id, 'records.create'));
create policy flocks_update on operations.flocks for update to authenticated
  using (authz.has_business_permission(business_id, 'records.edit'))
  with check (authz.has_business_permission(business_id, 'records.edit'));

create policy activity_read on operations.activity_records for select to authenticated
  using (authz.has_business_permission(business_id, 'records.view'));
create policy activity_insert on operations.activity_records for insert to authenticated
  with check (authz.has_business_permission(business_id, 'records.create'));
create policy activity_update on operations.activity_records for update to authenticated
  using (status = 'recorded' and authz.has_business_permission(business_id, 'records.edit'))
  with check (status = 'recorded' and authz.has_business_permission(business_id, 'records.edit'));

grant select on operations.flocks to authenticated;
grant insert (business_id, name, breed, acquired_on, initial_count) on operations.flocks to authenticated;
grant update (name, breed, acquired_on, initial_count, is_active) on operations.flocks to authenticated;

grant select on operations.activity_records to authenticated;
grant insert (business_id, activity_type_id, occurred_on, quantity, unit, flock_id, notes)
  on operations.activity_records to authenticated;
grant update (activity_type_id, occurred_on, quantity, unit, flock_id, notes)
  on operations.activity_records to authenticated;

create function operations.void_activity(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
begin
  select business_id into target from operations.activity_records where id = p_id;
  perform authz.require_business_permission(target, 'records.void');
  update operations.activity_records
     set status = 'voided', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
   where id = p_id and status = 'recorded';
  if not found then
    raise exception 'This record has already been voided.' using errcode = 'P0001';
  end if;
end $$;

grant execute on function operations.void_activity(uuid, text) to authenticated;
