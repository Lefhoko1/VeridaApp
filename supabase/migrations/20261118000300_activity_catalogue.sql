-- Industry-specific Activity Catalogue v1.0 with Business Taxonomy section 5: activity groups,
-- activity forms defined as data, an activity lifecycle, links to related records, and the
-- activities of every subcategory. Poultry and Tuckshop / convenience shop, the pilots, get
-- complete forms. The rest start from the catalogue's names, for staff to refine.
--
-- The lifecycle lives in activity_records.status, where 'recorded' means completed. Every
-- measure already counts only 'recorded' rows, so a planned or cancelled activity can never
-- change a figure.

------------------------------------------------------------------------------------------------
-- Activity groups (Business Taxonomy section 5).

create table platform.activity_groups (
  code        text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  name        text    not null unique check (length(trim(name)) between 1 and 80),
  description text    not null default '' check (char_length(description) <= 300),
  sort_order  int     not null default 0,
  is_active   boolean not null default true
);

insert into platform.activity_groups (code, name, description, sort_order) values
  ('sales_customer',        'Sales and customer service', 'Enquiries, quotations, orders, complaints, returns and customer follow-ups.', 1),
  ('purchasing',            'Purchasing and procurement', 'Supplier orders, purchase requests, goods received, supplier returns and follow-ups.', 2),
  ('stock_inventory',       'Stock and inventory',        'Stock counts, replenishment, adjustments, transfers, damaged or expired goods and stock usage.', 3),
  ('production_operations', 'Production and operations',  'Products made, goods processed, output, wastage, production runs and operational milestones.', 4),
  ('service_delivery',      'Service delivery',           'Appointments, jobs, projects, tasks completed, service hours and deliverables.', 5),
  ('workforce',             'Workforce and staffing',     'Attendance, shifts, work hours, staff training, leave and availability.', 6),
  ('assets_maintenance',    'Assets and maintenance',     'Inspections, repairs, servicing, breakdowns, equipment usage and maintenance schedules.', 7),
  ('delivery_logistics',    'Delivery and logistics',     'Deliveries, collections, trips, routes, dispatches and completed transport jobs.', 8),
  ('quality_compliance',    'Quality and compliance',     'Inspections, quality checks, incidents, safety checks, permits and compliance reviews.', 9),
  ('administration',        'Business administration',    'Meetings, planning, marketing campaigns, business reviews and administrative milestones.', 10);

------------------------------------------------------------------------------------------------
-- Activity types gain a group, a quantity rule, an on/off state and a form version.

alter table platform.activity_types
  add column group_code text references platform.activity_groups (code) on update cascade,
  -- required: every completed record has a quantity. optional: it may. none: it never does.
  add column quantity_mode text not null default 'required' check (quantity_mode in ('required', 'optional', 'none')),
  add column is_active boolean not null default true,
  -- Whether a business sees it until the owner chooses otherwise (catalogue section 1.1).
  add column enabled_by_default boolean not null default true,
  -- Raised whenever the type's fields change, and kept on each record (catalogue section 6).
  add column form_version int not null default 1;

update platform.activity_types t
   set group_code = m.grp
  from (values
    ('poultry', 'eggs_collected', 'production_operations'), ('poultry', 'eggs_rejected', 'quality_compliance'),
    ('poultry', 'flock_count', 'production_operations'), ('poultry', 'feed_used', 'production_operations'),
    ('poultry', 'health_event', 'production_operations'),
    ('retail', 'stock_received', 'purchasing'), ('retail', 'stock_count', 'stock_inventory'),
    ('retail', 'stock_adjustment', 'stock_inventory'), ('retail', 'wastage', 'stock_inventory'),
    ('salon', 'appointments', 'sales_customer'), ('salon', 'customers_served', 'service_delivery'),
    ('salon', 'services_delivered', 'service_delivery'),
    ('food', 'orders_completed', 'sales_customer'), ('food', 'meals_prepared', 'production_operations'),
    ('food', 'wastage', 'production_operations'),
    ('professional', 'projects_completed', 'service_delivery'), ('professional', 'client_meetings', 'sales_customer'),
    ('professional', 'billable_hours', 'service_delivery'),
    ('other', 'business_activity', 'administration'), ('other', 'units_delivered', 'service_delivery'),
    ('other', 'customers_served', 'service_delivery')
  ) as m (industry_code, code, grp)
 where t.industry_code = m.industry_code and t.code = m.code;

-- Types an administrator added before this migration.
update platform.activity_types set group_code = 'service_delivery' where group_code is null;
alter table platform.activity_types alter column group_code set not null;
alter table platform.activity_types alter column group_code set default 'service_delivery';

-- The catalogue's wording for the original pilot types.
update platform.activity_types set name = 'Vaccination or medication',
       description = 'A vaccination, treatment or medication given to the flock. Record what it cost as an expense.'
 where industry_code = 'poultry' and code = 'health_event';
update platform.activity_types set name = 'Feed consumed' where industry_code = 'poultry' and code = 'feed_used';
update platform.activity_types set name = 'Daily egg collection' where industry_code = 'poultry' and code = 'eggs_collected';
update platform.activity_types set name = 'Damaged or expired stock',
       description = 'Items expired, damaged or lost. Use a stock adjustment for other corrections.'
 where industry_code = 'retail' and code = 'wastage';

------------------------------------------------------------------------------------------------
-- Form fields (catalogue section 4): what an activity records beyond its date, quantity and notes.

create table platform.activity_type_fields (
  id               uuid primary key default gen_random_uuid(),
  activity_type_id uuid    not null references platform.activity_types (id) on delete cascade,
  code             text    not null check (code ~ '^[a-z][a-z0-9_]*$'),
  label            text    not null check (length(trim(label)) between 1 and 80),
  help             text    not null default '' check (char_length(help) <= 200),
  data_type        text    not null check (data_type in ('text', 'integer', 'decimal', 'date', 'time', 'boolean', 'select', 'multi_select')),
  is_required      boolean not null default false,
  unit             text,
  options          text[]  not null default '{}',
  min_value        numeric,
  max_value        numeric,
  sort_order       int     not null default 0,
  is_active        boolean not null default true,
  unique (activity_type_id, code),
  check (min_value is null or max_value is null or min_value <= max_value),
  check (data_type not in ('select', 'multi_select') or cardinality(options) > 0)
);
create index activity_type_fields_type_idx on platform.activity_type_fields (activity_type_id, sort_order);

-- A change to the fields is a new version of the form, so a record shows which one it used.
create function platform.bump_form_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update platform.activity_types set form_version = form_version + 1
   where id = coalesce(new.activity_type_id, old.activity_type_id);
  return coalesce(new, old);
end $$;

create trigger bump_form_version after insert or update or delete on platform.activity_type_fields
  for each row execute function platform.bump_form_version();

-- A field that records already use is deactivated, never deleted, so their answers keep a label.
create function platform.guard_field_delete() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from operations.activity_records r
              where r.activity_type_id = old.activity_type_id and r.details ? old.code) then
    raise exception 'Records already use this field. Deactivate it instead.' using errcode = '23503';
  end if;
  return old;
end $$;

------------------------------------------------------------------------------------------------
-- Activity records: lifecycle, form answers, responsible person and related records.

alter table records.sales_transactions add constraint sales_transactions_id_business_key unique (id, business_id);
alter table records.expenses add constraint expenses_id_business_key unique (id, business_id);

alter table operations.activity_records
  alter column quantity drop not null,
  alter column unit drop not null,
  add column details jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  add column form_version int,
  add column responsible_user_id uuid references identity.profiles (id),
  add column sale_id uuid,
  add column expense_id uuid,
  add column product_id uuid,
  -- A link can only point at a record of the same business. The amount stays on that record.
  add foreign key (sale_id, business_id) references records.sales_transactions (id, business_id) on delete restrict,
  add foreign key (expense_id, business_id) references records.expenses (id, business_id) on delete restrict,
  add foreign key (product_id, business_id) references records.products (id, business_id) on delete restrict,
  drop constraint activity_records_status_check,
  add constraint activity_records_status_check
    check (status in ('planned', 'in_progress', 'recorded', 'requires_review', 'cancelled', 'voided'));

create index activity_records_sale_idx on operations.activity_records (sale_id) where sale_id is not null;
create index activity_records_expense_idx on operations.activity_records (expense_id) where expense_id is not null;

create trigger guard_field_delete before delete on platform.activity_type_fields
  for each row execute function platform.guard_field_delete();

update operations.activity_records r set form_version = t.form_version
  from platform.activity_types t where t.id = r.activity_type_id;

-- Owners switch optional activity types on or off for their business (catalogue section 7).
create table operations.activity_type_settings (
  business_id      uuid    not null references business.businesses (id) on delete cascade,
  activity_type_id uuid    not null references platform.activity_types (id) on delete cascade,
  is_enabled       boolean not null,
  updated_at       timestamptz not null default now(),
  updated_by       uuid references identity.profiles (id),
  primary key (business_id, activity_type_id)
);

-- Whether a business can use a type now: available to one of its types, active, and switched on.
create function operations.activity_type_enabled(p_business_id uuid, p_type_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from platform.activity_types t
      join platform.activity_groups g on g.code = t.group_code
      join business.businesses b on t.industry_code = any (business.all_industries(b.industry_code, b.additional_industries))
      left join operations.activity_type_settings s on s.business_id = b.id and s.activity_type_id = t.id
     where b.id = p_business_id and t.id = p_type_id and t.is_active and g.is_active
       and coalesce(s.is_enabled, t.enabled_by_default)
  );
$$;

-- Answers must match the form: known fields only, the right kind of value, within range.
-- Required answers are needed only once the activity is completed.
create function operations.check_activity_details(p_type_id uuid, p_details jsonb, p_completed boolean) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  f platform.activity_type_fields;
  v jsonb;
  unknown text;
  number numeric;
begin
  select k into unknown
    from jsonb_object_keys(p_details) k
   where not exists (select 1 from platform.activity_type_fields f2 where f2.activity_type_id = p_type_id and f2.code = k)
   limit 1;
  if unknown is not null then
    raise exception 'This activity has no field called %.', unknown using errcode = '23514';
  end if;

  for f in select * from platform.activity_type_fields where activity_type_id = p_type_id loop
    v := p_details -> f.code;
    if v is null or v = 'null'::jsonb or (jsonb_typeof(v) = 'string' and trim(v #>> '{}') = '')
       or (jsonb_typeof(v) = 'array' and jsonb_array_length(v) = 0) then
      if f.is_required and f.is_active and p_completed then
        raise exception '% is required.', f.label using errcode = '23514';
      end if;
      continue;
    end if;

    case f.data_type
      when 'integer', 'decimal' then
        if jsonb_typeof(v) <> 'number' then
          raise exception '% must be a number.', f.label using errcode = '23514';
        end if;
        number := (v #>> '{}')::numeric;
        if f.data_type = 'integer' and number <> trunc(number) then
          raise exception '% must be a whole number.', f.label using errcode = '23514';
        end if;
        if f.min_value is not null and number < f.min_value then
          raise exception '% cannot be less than %.', f.label, f.min_value using errcode = '23514';
        end if;
        if f.max_value is not null and number > f.max_value then
          raise exception '% cannot be more than %.', f.label, f.max_value using errcode = '23514';
        end if;
      when 'boolean' then
        if jsonb_typeof(v) <> 'boolean' then
          raise exception '% must be yes or no.', f.label using errcode = '23514';
        end if;
      when 'date' then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
          raise exception '% must be a date.', f.label using errcode = '23514';
        end if;
      when 'time' then
        if jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^([01]\d|2[0-3]):[0-5]\d$' then
          raise exception '% must be a time, such as 14:30.', f.label using errcode = '23514';
        end if;
      when 'select' then
        if jsonb_typeof(v) <> 'string' or not ((v #>> '{}') = any (f.options)) then
          raise exception '% must be one of: %.', f.label, array_to_string(f.options, ', ') using errcode = '23514';
        end if;
      when 'multi_select' then
        if jsonb_typeof(v) <> 'array'
           or exists (select 1 from jsonb_array_elements(v) e
                       where jsonb_typeof(e) <> 'string' or not ((e #>> '{}') = any (f.options))) then
          raise exception '% must be chosen from: %.', f.label, array_to_string(f.options, ', ') using errcode = '23514';
        end if;
      else
        if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 500 then
          raise exception '% must be text of at most 500 characters.', f.label using errcode = '23514';
        end if;
    end case;
  end loop;
end $$;

-- Replaces the version in 20261104000100. Enforces the type's configuration on every write.
create or replace function operations.validate_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  config platform.activity_types;
  completed boolean := new.status = 'recorded';
begin
  select t.* into config
    from platform.activity_types t
    join business.businesses b on t.industry_code = any (business.all_industries(b.industry_code, b.additional_industries))
   where t.id = new.activity_type_id and b.id = new.business_id;
  if not found then
    raise exception 'This activity is not available for this type of business.' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('planned', 'in_progress', 'recorded', 'requires_review') then
      raise exception 'A new activity must be planned, in progress, completed or waiting for review.' using errcode = '23514';
    end if;
  end if;

  -- Voiding or cancelling an older record must not fail on a rule added later, and those
  -- changes leave the rest of the record alone.
  if tg_op = 'UPDATE' and new.status in ('voided', 'cancelled') then
    return new;
  end if;
  if tg_op = 'UPDATE'
     and (new.activity_type_id, new.quantity, new.unit, new.notes, new.details, new.status,
          new.responsible_user_id, new.sale_id, new.expense_id, new.product_id)
         is not distinct from
         (old.activity_type_id, old.quantity, old.unit, old.notes, old.details, old.status,
          old.responsible_user_id, old.sale_id, old.expense_id, old.product_id) then
    return new;
  end if;

  -- A type switched off or retired stays usable on the records that already have it.
  if (tg_op = 'INSERT' or new.activity_type_id is distinct from old.activity_type_id)
     and not operations.activity_type_enabled(new.business_id, new.activity_type_id) then
    raise exception '% is switched off for this business.', config.name using errcode = '23514';
  end if;

  if config.quantity_mode = 'none' then
    new.quantity := null;
    new.unit := null;
  elsif new.quantity is null then
    if config.quantity_mode = 'required' and completed then
      raise exception '% needs a quantity.', config.name using errcode = '23514';
    end if;
    new.unit := null;
  else
    if coalesce(trim(new.unit), '') = '' then
      new.unit := config.default_unit;
    end if;
    if new.quantity < 0 and not config.allows_negative then
      raise exception '% cannot be negative.', config.name using errcode = '23514';
    end if;
    if config.min_quantity is not null and new.quantity < config.min_quantity then
      raise exception '% cannot be less than %.', config.name, config.min_quantity using errcode = '23514';
    end if;
    if config.max_quantity is not null and new.quantity > config.max_quantity then
      raise exception '% cannot be more than %.', config.name, config.max_quantity using errcode = '23514';
    end if;
    if config.whole_numbers_only and new.quantity <> trunc(new.quantity) then
      raise exception '% must be a whole number.', config.name using errcode = '23514';
    end if;
    if cardinality(config.allowed_units) > 0
       and not exists (select 1 from unnest(config.allowed_units) u where lower(u) = lower(trim(new.unit))) then
      raise exception '% must use one of these units: %.', config.name, array_to_string(config.allowed_units, ', ')
        using errcode = '23514';
    end if;
  end if;

  if config.notes_required and completed and coalesce(trim(new.notes), '') = '' then
    raise exception '% needs a note.', config.name using errcode = '23514';
  end if;

  perform operations.check_activity_details(new.activity_type_id, new.details, completed);
  if tg_op = 'INSERT' or new.details is distinct from old.details or new.activity_type_id is distinct from old.activity_type_id then
    new.form_version := config.form_version;
  end if;

  if new.responsible_user_id is not null
     and (tg_op = 'INSERT' or new.responsible_user_id is distinct from old.responsible_user_id)
     and not exists (select 1 from business.memberships m
                      where m.business_id = new.business_id and m.user_id = new.responsible_user_id and m.status = 'active') then
    raise exception 'The responsible person must be a member of this business.' using errcode = '23514';
  end if;
  return new;
end $$;

-- Moves an activity through its lifecycle. Voiding a completed record stays in void_activity.
create function operations.set_activity_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  current_status text;
  target uuid;
begin
  select status, business_id into current_status, target from operations.activity_records where id = p_id;
  if target is null then
    raise exception 'This activity could not be found.' using errcode = 'P0002';
  end if;
  perform authz.require_business_permission(target, 'records.edit');
  if p_status not in ('planned', 'in_progress', 'recorded', 'requires_review', 'cancelled') then
    raise exception 'Choose a valid status.' using errcode = '23514';
  end if;
  if current_status in ('cancelled', 'voided') then
    raise exception 'A cancelled or voided activity cannot change.' using errcode = '23514';
  end if;
  if current_status = 'recorded' and p_status not in ('recorded', 'requires_review') then
    raise exception 'A completed activity can only be marked for review, or voided.' using errcode = '23514';
  end if;
  update operations.activity_records set status = p_status where id = p_id;
end $$;
grant execute on function operations.set_activity_status(uuid, text) to authenticated;

create or replace function operations.void_activity(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
begin
  select business_id into target from operations.activity_records where id = p_id;
  perform authz.require_business_permission(target, 'records.void');
  update operations.activity_records
     set status = 'voided', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
   where id = p_id and status in ('recorded', 'requires_review');
  if not found then
    raise exception 'Only a completed activity can be voided. Cancel one that has not happened.' using errcode = 'P0001';
  end if;
end $$;

-- Everything a business needs to show its activity forms, in one call.
create function operations.business_activity_types(p_business_id uuid)
returns table (
  id uuid, industry_code text, code text, name text, description text, group_code text, group_name text,
  default_unit text, quantity_mode text, uses_flock boolean, allows_negative boolean, min_quantity numeric,
  max_quantity numeric, whole_numbers_only boolean, notes_required boolean, allowed_units text[],
  is_enabled boolean, enabled_by_default boolean, form_version int, fields jsonb
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'records.view');
  return query
    select t.id, t.industry_code, t.code, t.name, t.description, t.group_code, g.name,
           t.default_unit, t.quantity_mode, t.uses_flock, t.allows_negative, t.min_quantity,
           t.max_quantity, t.whole_numbers_only, t.notes_required, t.allowed_units,
           coalesce(s.is_enabled, t.enabled_by_default), t.enabled_by_default, t.form_version,
           coalesce((select jsonb_agg(jsonb_build_object(
                       'code', f.code, 'label', f.label, 'help', f.help, 'data_type', f.data_type,
                       'is_required', f.is_required, 'unit', f.unit, 'options', to_jsonb(f.options),
                       'min_value', f.min_value, 'max_value', f.max_value) order by f.sort_order, f.label)
                       from platform.activity_type_fields f
                      where f.activity_type_id = t.id and f.is_active), '[]'::jsonb)
      from business.businesses b
     cross join lateral unnest(business.all_industries(b.industry_code, b.additional_industries))
           with ordinality as bt (industry_code, type_order)
      join platform.activity_types t on t.industry_code = bt.industry_code
      join platform.activity_groups g on g.code = t.group_code
      left join operations.activity_type_settings s on s.business_id = b.id and s.activity_type_id = t.id
     where b.id = p_business_id and t.is_active and g.is_active
     order by bt.type_order, t.sort_order, t.name;
end $$;
grant execute on function operations.business_activity_types(uuid) to authenticated;

create function operations.set_activity_type_enabled(p_business_id uuid, p_type_id uuid, p_enabled boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'business.manage');
  if not exists (select 1
                   from platform.activity_types t
                   join business.businesses b on t.industry_code = any (business.all_industries(b.industry_code, b.additional_industries))
                  where b.id = p_business_id and t.id = p_type_id) then
    raise exception 'This activity is not available for this type of business.' using errcode = '23514';
  end if;
  insert into operations.activity_type_settings (business_id, activity_type_id, is_enabled, updated_by)
  values (p_business_id, p_type_id, p_enabled, auth.uid())
  on conflict (business_id, activity_type_id)
  do update set is_enabled = excluded.is_enabled, updated_at = now(), updated_by = auth.uid();
end $$;
grant execute on function operations.set_activity_type_enabled(uuid, uuid, boolean) to authenticated;

------------------------------------------------------------------------------------------------
-- Access.

drop policy activity_update on operations.activity_records;
create policy activity_update on operations.activity_records for update to authenticated
  using (status in ('planned', 'in_progress', 'recorded', 'requires_review')
         and authz.has_business_permission(business_id, 'records.edit'))
  with check (status in ('planned', 'in_progress', 'recorded', 'requires_review')
              and authz.has_business_permission(business_id, 'records.edit'));

grant insert (status, details, responsible_user_id, sale_id, expense_id, product_id) on operations.activity_records to authenticated;
grant update (details, responsible_user_id, sale_id, expense_id, product_id) on operations.activity_records to authenticated;

alter table operations.activity_type_settings enable row level security;
grant select on operations.activity_type_settings to authenticated;
create policy activity_type_settings_read on operations.activity_type_settings for select to authenticated
  using (authz.has_business_permission(business_id, 'records.view'));
create trigger capture_change after insert or update or delete on operations.activity_type_settings
  for each row execute function audit.capture_change();

do $$
declare
  t text;
begin
  foreach t in array array['activity_groups', 'activity_type_fields']
  loop
    execute format('alter table platform.%I enable row level security', t);
    execute format('grant select, insert, update, delete on platform.%I to authenticated', t);
    execute format('create policy %I on platform.%I for select to authenticated using (true)', t || '_read', t);
    execute format($p$create policy %I on platform.%I for all to authenticated
                      using ((select authz.has_platform_permission('configuration.manage')))
                      with check ((select authz.has_platform_permission('configuration.manage')))$p$, t || '_admin', t);
    execute format('create trigger capture_change after insert or update or delete on platform.%I
                    for each row execute function audit.capture_change()', t);
  end loop;
end $$;

------------------------------------------------------------------------------------------------
-- Pilot: Poultry. Essentials are on, and the rest are ready for an owner to switch on.

insert into platform.activity_types
  (industry_code, code, name, description, default_unit, group_code, quantity_mode, uses_flock, whole_numbers_only,
   allowed_units, enabled_by_default, sort_order)
values
  ('poultry', 'flock_placement',     'Flock placement',         'Birds placed in a house or flock.',                               'birds', 'production_operations', 'required', true,  true,  '{}', false, 0),
  ('poultry', 'feed_received',       'Feed received',           'Feed delivered to the farm. Record what it cost as an expense.',  'kg',    'purchasing',            'required', false, false, '{kg,bags}', true, 6),
  ('poultry', 'water_check',         'Water check',             'A check of drinkers and water supply.',                           'checks', 'quality_compliance',   'none',     true,  false, '{}', false, 7),
  ('poultry', 'mortality',           'Mortality',               'Birds that died. Record the cause if it is known.',               'birds', 'production_operations', 'required', true,  true,  '{}', true,  8),
  ('poultry', 'egg_grading',         'Egg grading and packaging', 'Eggs graded and packed for sale.',                              'trays', 'production_operations', 'optional', true,  false, '{trays,eggs}', false, 9),
  ('poultry', 'cleaning_biosecurity','Cleaning and biosecurity','Cleaning, disinfection and other biosecurity work.',              'times', 'quality_compliance',    'none',     true,  false, '{}', false, 10),
  ('poultry', 'sales_dispatch',      'Sales dispatch',          'Eggs or birds sent out to a customer. Record the sale itself under Sales.', 'trays', 'delivery_logistics', 'optional', false, false, '{trays,eggs,birds}', false, 11);

-- Retire the reused unit 'event' on vaccinations: a vaccination counts the birds treated.
update platform.activity_types set quantity_mode = 'optional', default_unit = 'birds', allowed_units = '{}', sort_order = 5
 where industry_code = 'poultry' and code = 'health_event';

insert into platform.activity_type_fields (activity_type_id, code, label, help, data_type, is_required, unit, options, min_value, max_value, sort_order)
select t.id, f.code, f.label, f.help, f.data_type, f.is_required, f.unit, f.options, f.min_value, f.max_value, f.sort_order
  from (values
    ('flock_placement', 'breed',        'Breed',              '',                                     'text',     false, null::text, '{}'::text[], null::numeric, null::numeric, 1),
    ('flock_placement', 'age_weeks',    'Age when placed',    'In weeks. Day-old chicks are 0.',      'integer',  false, 'weeks', '{}', 0, 100, 2),
    ('flock_placement', 'source',       'Supplier or hatchery', '',                                   'text',     false, null, '{}', null, null, 3),
    ('feed_received',   'feed_type',    'Feed type',          '',                                     'select',   true,  null, '{Starter,Grower,Layer mash,Finisher,Other}', null, null, 1),
    ('feed_received',   'supplier',     'Supplier',           '',                                     'text',     false, null, '{}', null, null, 2),
    ('feed_used',       'feed_type',    'Feed type',          '',                                     'select',   false, null, '{Starter,Grower,Layer mash,Finisher,Other}', null, null, 1),
    ('water_check',     'water_ok',     'Water clean and flowing', '',                                'boolean',  true,  null, '{}', null, null, 1),
    ('water_check',     'action_taken', 'Action taken',       'What was done if there was a problem.', 'text',    false, null, '{}', null, null, 2),
    ('health_event',    'treatment_type','Treatment',         '',                                     'select',   false, null, '{Vaccination,Medication,Vitamins,Other}', null, null, 1),
    ('health_event',    'product',      'Product used',       '',                                     'text',     false, null, '{}', null, null, 2),
    ('health_event',    'withdrawal_until','Eggs not for sale until', 'The end of any withdrawal period.', 'date', false, null, '{}', null, null, 3),
    ('mortality',       'cause',        'Cause',              '',                                     'select',   true,  null, '{Disease,Heat stress,Predator,Injury,Unknown,Other}', null, null, 1),
    ('egg_grading',     'grades',       'Grades packed',      '',                                     'multi_select', false, null, '{Small,Medium,Large,Extra large,Jumbo}', null, null, 1),
    ('egg_grading',     'rejected',     'Eggs rejected',      '',                                     'integer',  false, 'eggs', '{}', 0, null, 2),
    ('cleaning_biosecurity', 'area',    'Area',               '',                                     'select',   true,  null, '{Laying house,Feeders and drinkers,Egg room,Footbath,Whole farm,Other}', null, null, 1),
    ('cleaning_biosecurity', 'product', 'Disinfectant used',  '',                                     'text',     false, null, '{}', null, null, 2),
    ('sales_dispatch',  'destination',  'Customer or destination', '',                                'text',     true,  null, '{}', null, null, 1)
  ) as f (type_code, code, label, help, data_type, is_required, unit, options, min_value, max_value, sort_order)
  join platform.activity_types t on t.industry_code = 'poultry' and t.code = f.type_code;

------------------------------------------------------------------------------------------------
-- Pilot: Tuckshop / convenience shop.

update platform.activity_types set sort_order = 3 where industry_code = 'retail' and code = 'stock_received';
update platform.activity_types set sort_order = 5 where industry_code = 'retail' and code = 'stock_count';
update platform.activity_types set sort_order = 6 where industry_code = 'retail' and code = 'wastage';
update platform.activity_types set sort_order = 9 where industry_code = 'retail' and code = 'stock_adjustment';

insert into platform.activity_types
  (industry_code, code, name, description, default_unit, group_code, quantity_mode, whole_numbers_only,
   allows_negative, enabled_by_default, sort_order)
values
  ('retail', 'opening_cash_count',   'Opening cash count',       'Cash in the till when the shop opens.',                        'cash',  'administration',    'required', false, false, true,  1),
  ('retail', 'daily_sales_check',    'Daily sales check',        'A check that the day''s sales were all recorded. Record each sale under Sales.', 'checks', 'sales_customer', 'none', false, false, false, 2),
  ('retail', 'shelf_replenishment',  'Shelf replenishment',      'Items moved from storage to the shelves.',                     'items', 'stock_inventory',   'optional', true,  false, false, 4),
  ('retail', 'expiry_check',         'Expiry and damage check',  'A check of shelves for expired or damaged items.',             'checks', 'quality_compliance', 'none',    false, false, false, 7),
  ('retail', 'supplier_order',       'Supplier order',           'Stock ordered from a supplier. Plan it now and complete it when it arrives.', 'items', 'purchasing', 'optional', true, false, true, 8),
  ('retail', 'customer_return',      'Customer return',          'Items a customer brought back. Record any refund under Sales.', 'items', 'sales_customer',   'required', true,  false, true,  10),
  ('retail', 'cash_up',              'Cash-up and closing',      'Cash counted at closing.',                                     'cash',  'administration',    'required', false, false, true,  11);

insert into platform.activity_type_fields (activity_type_id, code, label, help, data_type, is_required, unit, options, min_value, max_value, sort_order)
select t.id, f.code, f.label, f.help, f.data_type, f.is_required, f.unit, f.options, f.min_value, f.max_value, f.sort_order
  from (values
    ('opening_cash_count', 'float_given',     'Float included',      'Change put in the till.',            'decimal',  false, null::text, '{}'::text[], 0::numeric, null::numeric, 1),
    ('daily_sales_check',  'all_recorded',    'All sales recorded',  '',                                   'boolean',  true,  null, '{}', null, null, 1),
    ('stock_received',     'supplier',        'Supplier',            '',                                   'text',     false, null, '{}', null, null, 1),
    ('stock_received',     'invoice_number',  'Invoice or delivery note', '',                              'text',     false, null, '{}', null, null, 2),
    ('shelf_replenishment','section',         'Shelf or section',    '',                                   'text',     false, null, '{}', null, null, 1),
    ('stock_count',        'count_type',      'Count type',          '',                                   'select',   false, null, '{Full count,Spot check}', null, null, 1),
    ('wastage',            'reason',          'Reason',              '',                                   'select',   false, null, '{Expired,Damaged,Lost or stolen,Other}', null, null, 1),
    ('expiry_check',       'items_removed',   'Items removed',       'Record them as damaged or expired stock too.', 'integer', false, 'items', '{}', 0, null, 1),
    ('supplier_order',     'supplier',        'Supplier',            '',                                   'text',     true,  null, '{}', null, null, 1),
    ('supplier_order',     'expected_on',     'Expected delivery',   '',                                   'date',     false, null, '{}', null, null, 2),
    ('customer_return',    'reason',          'Reason',              '',                                   'select',   true,  null, '{Damaged,Wrong item,Expired,Changed mind,Other}', null, null, 1),
    ('customer_return',    'back_to_stock',   'Returned to stock',   '',                                   'boolean',  false, null, '{}', null, null, 2),
    ('cash_up',            'expected_cash',   'Expected cash',       'From the day''s sales, if known.',   'decimal',  false, null, '{}', 0, null, 1),
    ('cash_up',            'closed_by',       'Closed by',           '',                                   'text',     false, null, '{}', null, null, 2)
  ) as f (type_code, code, label, help, data_type, is_required, unit, options, min_value, max_value, sort_order)
  join platform.activity_types t on t.industry_code = 'retail' and t.code = f.type_code;

------------------------------------------------------------------------------------------------
-- Every other subcategory: the catalogue's suggested activities, generated from the spec.
-- Each starts as a simple record with a date, status, optional notes and no quantity, so that
-- nothing is assumed about units. Staff add quantities and fields as each one is refined.

insert into platform.activity_types (industry_code, code, name, default_unit, group_code, quantity_mode, sort_order)
select v.industry_code, v.code, v.name, 'times', v.group_code, 'none', v.sort_order
  from (values
    ('crop_farming', 'land_preparation', 'Land preparation', 'production_operations', 10),
    ('crop_farming', 'planting_and_seeding', 'Planting and seeding', 'production_operations', 11),
    ('crop_farming', 'irrigation', 'Irrigation', 'production_operations', 12),
    ('crop_farming', 'fertiliser_and_pesticide_application', 'Fertiliser and pesticide application', 'production_operations', 13),
    ('crop_farming', 'crop_scouting', 'Crop scouting', 'quality_compliance', 14),
    ('crop_farming', 'weeding', 'Weeding', 'production_operations', 15),
    ('crop_farming', 'harvesting', 'Harvesting', 'production_operations', 16),
    ('crop_farming', 'grading_and_storage', 'Grading and storage', 'stock_inventory', 17),
    ('livestock', 'animal_purchase_and_identification', 'Animal purchase and identification', 'purchasing', 10),
    ('livestock', 'herd_flock_count', 'Herd/flock count', 'stock_inventory', 11),
    ('livestock', 'grazing_and_feeding', 'Grazing and feeding', 'production_operations', 12),
    ('livestock', 'watering', 'Watering', 'production_operations', 13),
    ('livestock', 'breeding_and_birth_records', 'Breeding and birth records', 'production_operations', 14),
    ('livestock', 'vaccination_and_treatment', 'Vaccination and treatment', 'production_operations', 15),
    ('livestock', 'mortality', 'Mortality', 'production_operations', 16),
    ('livestock', 'weighing_and_condition_checks', 'Weighing and condition checks', 'quality_compliance', 17),
    ('livestock', 'sales_and_movement', 'Sales and movement', 'sales_customer', 18),
    ('horticulture', 'bed_or_orchard_preparation', 'Bed or orchard preparation', 'production_operations', 10),
    ('horticulture', 'propagation_and_planting', 'Propagation and planting', 'production_operations', 11),
    ('horticulture', 'irrigation', 'Irrigation', 'production_operations', 12),
    ('horticulture', 'pruning_and_training', 'Pruning and training', 'production_operations', 13),
    ('horticulture', 'pest_and_disease_monitoring', 'Pest and disease monitoring', 'quality_compliance', 14),
    ('horticulture', 'fertiliser_application', 'Fertiliser application', 'production_operations', 15),
    ('horticulture', 'harvesting', 'Harvesting', 'production_operations', 16),
    ('horticulture', 'grading_and_packing', 'Grading and packing', 'production_operations', 17),
    ('aquaculture', 'stocking_ponds_or_tanks', 'Stocking ponds or tanks', 'stock_inventory', 10),
    ('aquaculture', 'water_quality_checks', 'Water-quality checks', 'quality_compliance', 11),
    ('aquaculture', 'feeding', 'Feeding', 'production_operations', 12),
    ('aquaculture', 'growth_sampling', 'Growth sampling', 'production_operations', 13),
    ('aquaculture', 'mortality_recording', 'Mortality recording', 'production_operations', 14),
    ('aquaculture', 'pond_or_tank_maintenance', 'Pond or tank maintenance', 'assets_maintenance', 15),
    ('aquaculture', 'harvesting', 'Harvesting', 'production_operations', 16),
    ('aquaculture', 'grading_and_dispatch', 'Grading and dispatch', 'delivery_logistics', 17),
    ('beekeeping', 'hive_installation_and_inspection', 'Hive installation and inspection', 'quality_compliance', 10),
    ('beekeeping', 'colony_strength_checks', 'Colony strength checks', 'quality_compliance', 11),
    ('beekeeping', 'feeding_or_treatment', 'Feeding or treatment', 'production_operations', 12),
    ('beekeeping', 'swarm_management', 'Swarm management', 'production_operations', 13),
    ('beekeeping', 'honey_harvesting', 'Honey harvesting', 'production_operations', 14),
    ('beekeeping', 'honey_extraction_and_filtering', 'Honey extraction and filtering', 'production_operations', 15),
    ('beekeeping', 'packaging', 'Packaging', 'production_operations', 16),
    ('beekeeping', 'apiary_maintenance', 'Apiary maintenance', 'assets_maintenance', 17),
    ('agri_inputs', 'supplier_purchasing', 'Supplier purchasing', 'purchasing', 10),
    ('agri_inputs', 'goods_received', 'Goods received', 'purchasing', 11),
    ('agri_inputs', 'batch_and_expiry_checks', 'Batch and expiry checks', 'quality_compliance', 12),
    ('agri_inputs', 'stock_counts', 'Stock counts', 'stock_inventory', 13),
    ('agri_inputs', 'storage_condition_checks', 'Storage-condition checks', 'quality_compliance', 14),
    ('agri_inputs', 'customer_orders', 'Customer orders', 'sales_customer', 15),
    ('agri_inputs', 'sales_dispatch', 'Sales dispatch', 'delivery_logistics', 16),
    ('agri_inputs', 'returns_and_recalls', 'Returns and recalls', 'sales_customer', 17),
    ('agri_services', 'client_enquiry_and_farm_assessment', 'Client enquiry and farm assessment', 'sales_customer', 10),
    ('agri_services', 'service_quotation', 'Service quotation', 'sales_customer', 11),
    ('agri_services', 'field_visit_scheduling', 'Field visit scheduling', 'administration', 12),
    ('agri_services', 'service_delivery', 'Service delivery', 'service_delivery', 13),
    ('agri_services', 'equipment_or_input_usage', 'Equipment or input usage', 'stock_inventory', 14),
    ('agri_services', 'job_completion', 'Job completion', 'production_operations', 15),
    ('agri_services', 'client_sign_off', 'Client sign-off', 'administration', 16),
    ('agri_services', 'follow_up', 'Follow-up', 'sales_customer', 17),
    ('grocery', 'goods_receiving', 'Goods receiving', 'purchasing', 10),
    ('grocery', 'batch_and_expiry_checks', 'Batch and expiry checks', 'quality_compliance', 11),
    ('grocery', 'shelf_replenishment', 'Shelf replenishment', 'stock_inventory', 12),
    ('grocery', 'price_updates', 'Price updates', 'administration', 13),
    ('grocery', 'daily_sales', 'Daily sales', 'sales_customer', 14),
    ('grocery', 'stock_counts', 'Stock counts', 'stock_inventory', 15),
    ('grocery', 'wastage_recording', 'Wastage recording', 'production_operations', 16),
    ('grocery', 'promotions', 'Promotions', 'administration', 17),
    ('grocery', 'checkout_reconciliation', 'Checkout reconciliation', 'quality_compliance', 18),
    ('clothing_footwear', 'goods_receiving', 'Goods receiving', 'purchasing', 10),
    ('clothing_footwear', 'size_and_colour_variant_setup', 'Size and colour variant setup', 'production_operations', 11),
    ('clothing_footwear', 'display_and_merchandising', 'Display and merchandising', 'administration', 12),
    ('clothing_footwear', 'sales', 'Sales', 'sales_customer', 13),
    ('clothing_footwear', 'fitting_or_alteration_requests', 'Fitting or alteration requests', 'sales_customer', 14),
    ('clothing_footwear', 'stock_counts', 'Stock counts', 'stock_inventory', 15),
    ('clothing_footwear', 'returns_and_exchanges', 'Returns and exchanges', 'sales_customer', 16),
    ('clothing_footwear', 'seasonal_markdowns', 'Seasonal markdowns', 'administration', 17),
    ('hardware', 'goods_receiving', 'Goods receiving', 'purchasing', 10),
    ('hardware', 'product_and_unit_verification', 'Product and unit verification', 'quality_compliance', 11),
    ('hardware', 'bulk_stock_counts', 'Bulk stock counts', 'stock_inventory', 12),
    ('hardware', 'quotation_preparation', 'Quotation preparation', 'sales_customer', 13),
    ('hardware', 'order_picking', 'Order picking', 'stock_inventory', 14),
    ('hardware', 'delivery_scheduling', 'Delivery scheduling', 'delivery_logistics', 15),
    ('hardware', 'sales', 'Sales', 'sales_customer', 16),
    ('hardware', 'returns', 'Returns', 'sales_customer', 17),
    ('hardware', 'damaged_stock_recording', 'Damaged stock recording', 'stock_inventory', 18),
    ('electronics', 'goods_receiving_and_serial_number_capture', 'Goods receiving and serial-number capture', 'purchasing', 10),
    ('electronics', 'product_demonstration', 'Product demonstration', 'sales_customer', 11),
    ('electronics', 'sales', 'Sales', 'sales_customer', 12),
    ('electronics', 'warranty_registration', 'Warranty registration', 'sales_customer', 13),
    ('electronics', 'delivery_and_installation', 'Delivery and installation', 'delivery_logistics', 14),
    ('electronics', 'returns', 'Returns', 'sales_customer', 15),
    ('electronics', 'repair_intake', 'Repair intake', 'assets_maintenance', 16),
    ('electronics', 'warranty_claim_tracking', 'Warranty claim tracking', 'sales_customer', 17),
    ('pharmacy_retail', 'goods_receiving', 'Goods receiving', 'purchasing', 10),
    ('pharmacy_retail', 'batch_and_expiry_capture', 'Batch and expiry capture', 'stock_inventory', 11),
    ('pharmacy_retail', 'storage_checks', 'Storage checks', 'quality_compliance', 12),
    ('pharmacy_retail', 'stock_counts', 'Stock counts', 'stock_inventory', 13),
    ('pharmacy_retail', 'authorised_dispensing_or_sale_workflow', 'Authorised dispensing or sale workflow', 'sales_customer', 14),
    ('pharmacy_retail', 'near_expiry_review', 'Near-expiry review', 'stock_inventory', 15),
    ('pharmacy_retail', 'returns_and_recalls', 'Returns and recalls', 'sales_customer', 16),
    ('pharmacy_retail', 'temperature_monitoring_where_required', 'Temperature monitoring where required', 'quality_compliance', 17),
    ('wholesale', 'supplier_purchasing', 'Supplier purchasing', 'purchasing', 10),
    ('wholesale', 'bulk_goods_receiving', 'Bulk goods receiving', 'purchasing', 11),
    ('wholesale', 'warehouse_put_away', 'Warehouse put-away', 'stock_inventory', 12),
    ('wholesale', 'order_allocation', 'Order allocation', 'workforce', 13),
    ('wholesale', 'picking_and_packing', 'Picking and packing', 'stock_inventory', 14),
    ('wholesale', 'dispatch', 'Dispatch', 'delivery_logistics', 15),
    ('wholesale', 'delivery_confirmation', 'Delivery confirmation', 'delivery_logistics', 16),
    ('wholesale', 'customer_credit_follow_up', 'Customer credit follow-up', 'sales_customer', 17),
    ('wholesale', 'returns', 'Returns', 'sales_customer', 18),
    ('online_retail', 'product_listing_updates', 'Product listing updates', 'administration', 10),
    ('online_retail', 'online_order_receipt', 'Online order receipt', 'sales_customer', 11),
    ('online_retail', 'payment_status_review', 'Payment-status review', 'administration', 12),
    ('online_retail', 'order_picking_and_packing', 'Order picking and packing', 'stock_inventory', 13),
    ('online_retail', 'dispatch', 'Dispatch', 'delivery_logistics', 14),
    ('online_retail', 'delivery_tracking', 'Delivery tracking', 'delivery_logistics', 15),
    ('online_retail', 'customer_messages', 'Customer messages', 'sales_customer', 16),
    ('online_retail', 'returns_and_refunds', 'Returns and refunds', 'sales_customer', 17),
    ('online_retail', 'listing_performance_review', 'Listing performance review', 'administration', 18),
    ('general_merchandise', 'goods_receiving', 'Goods receiving', 'purchasing', 10),
    ('general_merchandise', 'product_categorisation', 'Product categorisation', 'service_delivery', 11),
    ('general_merchandise', 'display_setup', 'Display setup', 'production_operations', 12),
    ('general_merchandise', 'daily_sales', 'Daily sales', 'sales_customer', 13),
    ('general_merchandise', 'stock_replenishment', 'Stock replenishment', 'stock_inventory', 14),
    ('general_merchandise', 'stock_counts', 'Stock counts', 'stock_inventory', 15),
    ('general_merchandise', 'damaged_goods', 'Damaged goods', 'service_delivery', 16),
    ('general_merchandise', 'promotions', 'Promotions', 'administration', 17),
    ('general_merchandise', 'returns', 'Returns', 'sales_customer', 18),
    ('salon', 'appointment_booking', 'Appointment booking', 'sales_customer', 10),
    ('salon', 'client_consultation', 'Client consultation', 'sales_customer', 11),
    ('salon', 'service_performed', 'Service performed', 'service_delivery', 12),
    ('salon', 'stylist_time_capture', 'Stylist time capture', 'workforce', 13),
    ('salon', 'products_consumed', 'Products consumed', 'stock_inventory', 14),
    ('salon', 'retail_products_sold', 'Retail products sold', 'sales_customer', 15),
    ('salon', 'appointment_completion', 'Appointment completion', 'sales_customer', 16),
    ('salon', 'rebooking', 'Rebooking', 'sales_customer', 17),
    ('salon', 'client_feedback', 'Client feedback', 'sales_customer', 18),
    ('barbershop', 'walk_in_or_appointment_queue', 'Walk-in or appointment queue', 'sales_customer', 10),
    ('barbershop', 'client_consultation', 'Client consultation', 'sales_customer', 11),
    ('barbershop', 'haircut_or_grooming_service', 'Haircut or grooming service', 'service_delivery', 12),
    ('barbershop', 'barber_time_capture', 'Barber time capture', 'workforce', 13),
    ('barbershop', 'consumables_used', 'Consumables used', 'stock_inventory', 14),
    ('barbershop', 'add_on_sales', 'Add-on sales', 'sales_customer', 15),
    ('barbershop', 'daily_chair_utilisation', 'Daily chair utilisation', 'workforce', 16),
    ('barbershop', 'customer_feedback', 'Customer feedback', 'sales_customer', 17),
    ('nail_studio', 'appointment_booking', 'Appointment booking', 'sales_customer', 10),
    ('nail_studio', 'nail_assessment', 'Nail assessment', 'service_delivery', 11),
    ('nail_studio', 'manicure_or_pedicure_performed', 'Manicure or pedicure performed', 'service_delivery', 12),
    ('nail_studio', 'materials_used', 'Materials used', 'stock_inventory', 13),
    ('nail_studio', 'hygiene_and_tool_sterilisation', 'Hygiene and tool sterilisation', 'quality_compliance', 14),
    ('nail_studio', 'service_completion', 'Service completion', 'service_delivery', 15),
    ('nail_studio', 'rebooking', 'Rebooking', 'sales_customer', 16),
    ('nail_studio', 'client_feedback', 'Client feedback', 'sales_customer', 17),
    ('spa_massage', 'booking_and_consent_capture', 'Booking and consent capture', 'quality_compliance', 10),
    ('spa_massage', 'client_intake', 'Client intake', 'sales_customer', 11),
    ('spa_massage', 'treatment_room_preparation', 'Treatment-room preparation', 'production_operations', 12),
    ('spa_massage', 'treatment_delivered', 'Treatment delivered', 'service_delivery', 13),
    ('spa_massage', 'consumables_used', 'Consumables used', 'stock_inventory', 14),
    ('spa_massage', 'room_turnaround', 'Room turnaround', 'assets_maintenance', 15),
    ('spa_massage', 'package_session_balance', 'Package/session balance', 'service_delivery', 16),
    ('spa_massage', 'client_feedback', 'Client feedback', 'sales_customer', 17),
    ('skincare', 'client_consultation', 'Client consultation', 'sales_customer', 10),
    ('skincare', 'skin_assessment', 'Skin assessment', 'service_delivery', 11),
    ('skincare', 'treatment_plan', 'Treatment plan', 'administration', 12),
    ('skincare', 'treatment_delivered', 'Treatment delivered', 'service_delivery', 13),
    ('skincare', 'products_used', 'Products used', 'stock_inventory', 14),
    ('skincare', 'patch_test_or_safety_record_where_applicable', 'Patch-test or safety record where applicable', 'quality_compliance', 15),
    ('skincare', 'follow_up_appointment', 'Follow-up appointment', 'sales_customer', 16),
    ('skincare', 'client_feedback', 'Client feedback', 'sales_customer', 17),
    ('makeup', 'booking_and_event_details', 'Booking and event details', 'sales_customer', 10),
    ('makeup', 'client_consultation', 'Client consultation', 'sales_customer', 11),
    ('makeup', 'look_selection', 'Look selection', 'service_delivery', 12),
    ('makeup', 'products_and_shades_used', 'Products and shades used', 'stock_inventory', 13),
    ('makeup', 'makeup_application', 'Makeup application', 'service_delivery', 14),
    ('makeup', 'travel_or_setup', 'Travel or setup', 'delivery_logistics', 15),
    ('makeup', 'service_sign_off', 'Service sign-off', 'administration', 16),
    ('makeup', 'portfolio_photo_consent', 'Portfolio/photo consent', 'quality_compliance', 17),
    ('beauty_retail', 'product_receiving', 'Product receiving', 'purchasing', 10),
    ('beauty_retail', 'batch_and_expiry_checks', 'Batch and expiry checks', 'quality_compliance', 11),
    ('beauty_retail', 'product_display', 'Product display', 'service_delivery', 12),
    ('beauty_retail', 'customer_consultation', 'Customer consultation', 'sales_customer', 13),
    ('beauty_retail', 'product_sales', 'Product sales', 'sales_customer', 14),
    ('beauty_retail', 'stock_counts', 'Stock counts', 'stock_inventory', 15),
    ('beauty_retail', 'tester_usage', 'Tester usage', 'quality_compliance', 16),
    ('beauty_retail', 'returns', 'Returns', 'sales_customer', 17),
    ('beauty_retail', 'reorder_review', 'Reorder review', 'administration', 18),
    ('personal_care', 'client_booking', 'Client booking', 'sales_customer', 10),
    ('personal_care', 'intake_and_consent', 'Intake and consent', 'quality_compliance', 11),
    ('personal_care', 'service_delivery', 'Service delivery', 'service_delivery', 12),
    ('personal_care', 'consumables_used', 'Consumables used', 'stock_inventory', 13),
    ('personal_care', 'hygiene_checks', 'Hygiene checks', 'quality_compliance', 14),
    ('personal_care', 'session_completion', 'Session completion', 'service_delivery', 15),
    ('personal_care', 'follow_up_scheduling', 'Follow-up scheduling', 'administration', 16),
    ('personal_care', 'client_feedback', 'Client feedback', 'sales_customer', 17),
    ('food', 'reservation_or_walk_in_capture', 'Reservation or walk-in capture', 'sales_customer', 10),
    ('food', 'order_received', 'Order received', 'sales_customer', 11),
    ('food', 'food_preparation', 'Food preparation', 'production_operations', 12),
    ('food', 'order_served', 'Order served', 'sales_customer', 13),
    ('food', 'table_turnover', 'Table turnover', 'production_operations', 14),
    ('food', 'ingredient_usage', 'Ingredient usage', 'stock_inventory', 15),
    ('food', 'food_wastage', 'Food wastage', 'production_operations', 16),
    ('food', 'cleaning_and_hygiene_checks', 'Cleaning and hygiene checks', 'quality_compliance', 17),
    ('food', 'shift_close', 'Shift close', 'workforce', 18),
    ('cafe', 'order_received', 'Order received', 'sales_customer', 10),
    ('cafe', 'beverage_and_food_preparation', 'Beverage and food preparation', 'production_operations', 11),
    ('cafe', 'order_served', 'Order served', 'sales_customer', 12),
    ('cafe', 'ingredient_and_packaging_usage', 'Ingredient and packaging usage', 'stock_inventory', 13),
    ('cafe', 'display_replenishment', 'Display replenishment', 'stock_inventory', 14),
    ('cafe', 'equipment_cleaning', 'Equipment cleaning', 'assets_maintenance', 15),
    ('cafe', 'wastage', 'Wastage', 'production_operations', 16),
    ('cafe', 'daily_cash_up', 'Daily cash-up', 'administration', 17),
    ('catering', 'client_enquiry', 'Client enquiry', 'sales_customer', 10),
    ('catering', 'event_quotation', 'Event quotation', 'sales_customer', 11),
    ('catering', 'menu_and_guest_count_confirmation', 'Menu and guest-count confirmation', 'stock_inventory', 12),
    ('catering', 'ingredient_procurement', 'Ingredient procurement', 'purchasing', 13),
    ('catering', 'food_preparation', 'Food preparation', 'production_operations', 14),
    ('catering', 'delivery_and_setup', 'Delivery and setup', 'delivery_logistics', 15),
    ('catering', 'service_execution', 'Service execution', 'production_operations', 16),
    ('catering', 'event_close_and_client_sign_off', 'Event close and client sign-off', 'administration', 17),
    ('bakery', 'production_planning', 'Production planning', 'administration', 10),
    ('bakery', 'ingredient_issuing', 'Ingredient issuing', 'stock_inventory', 11),
    ('bakery', 'batch_production', 'Batch production', 'production_operations', 12),
    ('bakery', 'baking_and_cooling', 'Baking and cooling', 'production_operations', 13),
    ('bakery', 'quality_checks', 'Quality checks', 'quality_compliance', 14),
    ('bakery', 'packaging', 'Packaging', 'production_operations', 15),
    ('bakery', 'finished_goods_stock', 'Finished goods stock', 'stock_inventory', 16),
    ('bakery', 'dispatch', 'Dispatch', 'delivery_logistics', 17),
    ('bakery', 'unsold_wastage_recording', 'Unsold/wastage recording', 'production_operations', 18),
    ('takeaway', 'daily_menu_setup', 'Daily menu setup', 'production_operations', 10),
    ('takeaway', 'customer_order', 'Customer order', 'sales_customer', 11),
    ('takeaway', 'food_preparation', 'Food preparation', 'production_operations', 12),
    ('takeaway', 'order_handover', 'Order handover', 'sales_customer', 13),
    ('takeaway', 'ingredient_usage', 'Ingredient usage', 'stock_inventory', 14),
    ('takeaway', 'packaging_usage', 'Packaging usage', 'stock_inventory', 15),
    ('takeaway', 'hygiene_checks', 'Hygiene checks', 'quality_compliance', 16),
    ('takeaway', 'daily_sales_and_cash_up', 'Daily sales and cash-up', 'administration', 17),
    ('food_production', 'production_order', 'Production order', 'sales_customer', 10),
    ('food_production', 'raw_material_receiving', 'Raw-material receiving', 'purchasing', 11),
    ('food_production', 'batch_preparation', 'Batch preparation', 'production_operations', 12),
    ('food_production', 'processing', 'Processing', 'production_operations', 13),
    ('food_production', 'quality_and_safety_checks', 'Quality and safety checks', 'quality_compliance', 14),
    ('food_production', 'yield_and_wastage_recording', 'Yield and wastage recording', 'production_operations', 15),
    ('food_production', 'packaging', 'Packaging', 'production_operations', 16),
    ('food_production', 'finished_goods_transfer', 'Finished-goods transfer', 'production_operations', 17),
    ('bar', 'stock_receiving', 'Stock receiving', 'purchasing', 10),
    ('bar', 'beverage_storage_checks', 'Beverage storage checks', 'quality_compliance', 11),
    ('bar', 'customer_order', 'Customer order', 'sales_customer', 12),
    ('bar', 'beverage_preparation_service', 'Beverage preparation/service', 'production_operations', 13),
    ('bar', 'stock_usage', 'Stock usage', 'stock_inventory', 14),
    ('bar', 'age_id_compliance_check_where_required', 'Age/ID compliance check where required', 'quality_compliance', 15),
    ('bar', 'breakage_and_wastage', 'Breakage and wastage', 'production_operations', 16),
    ('bar', 'shift_reconciliation', 'Shift reconciliation', 'workforce', 17),
    ('guesthouse', 'reservation', 'Reservation', 'sales_customer', 10),
    ('guesthouse', 'guest_check_in', 'Guest check-in', 'sales_customer', 11),
    ('guesthouse', 'room_allocation', 'Room allocation', 'workforce', 12),
    ('guesthouse', 'housekeeping', 'Housekeeping', 'assets_maintenance', 13),
    ('guesthouse', 'maintenance_issue', 'Maintenance issue', 'assets_maintenance', 14),
    ('guesthouse', 'guest_service_request', 'Guest service request', 'sales_customer', 15),
    ('guesthouse', 'check_out', 'Check-out', 'sales_customer', 16),
    ('guesthouse', 'room_inspection', 'Room inspection', 'quality_compliance', 17),
    ('guesthouse', 'occupancy_review', 'Occupancy review', 'administration', 18),
    ('accommodation', 'booking', 'Booking', 'sales_customer', 10),
    ('accommodation', 'guest_registration', 'Guest registration', 'sales_customer', 11),
    ('accommodation', 'check_in', 'Check-in', 'sales_customer', 12),
    ('accommodation', 'room_or_unit_preparation', 'Room or unit preparation', 'production_operations', 13),
    ('accommodation', 'housekeeping', 'Housekeeping', 'assets_maintenance', 14),
    ('accommodation', 'guest_issue_resolution', 'Guest issue resolution', 'sales_customer', 15),
    ('accommodation', 'check_out', 'Check-out', 'sales_customer', 16),
    ('accommodation', 'cleaning_inspection', 'Cleaning inspection', 'quality_compliance', 17),
    ('accommodation', 'occupancy_and_availability_update', 'Occupancy and availability update', 'sales_customer', 18),
    ('event_catering', 'event_enquiry', 'Event enquiry', 'sales_customer', 10),
    ('event_catering', 'site_assessment', 'Site assessment', 'production_operations', 11),
    ('event_catering', 'quotation', 'Quotation', 'sales_customer', 12),
    ('event_catering', 'menu_and_attendance_confirmation', 'Menu and attendance confirmation', 'workforce', 13),
    ('event_catering', 'procurement', 'Procurement', 'purchasing', 14),
    ('event_catering', 'preparation', 'Preparation', 'production_operations', 15),
    ('event_catering', 'setup', 'Setup', 'production_operations', 16),
    ('event_catering', 'service', 'Service', 'production_operations', 17),
    ('event_catering', 'breakdown_and_equipment_return', 'Breakdown and equipment return', 'assets_maintenance', 18),
    ('professional', 'client_enquiry', 'Client enquiry', 'sales_customer', 10),
    ('professional', 'discovery_meeting', 'Discovery meeting', 'administration', 11),
    ('professional', 'proposal_and_scope', 'Proposal and scope', 'sales_customer', 12),
    ('professional', 'engagement_approval', 'Engagement approval', 'administration', 13),
    ('professional', 'project_plan', 'Project plan', 'administration', 14),
    ('professional', 'work_sessions', 'Work sessions', 'service_delivery', 15),
    ('professional', 'milestone_completion', 'Milestone completion', 'service_delivery', 16),
    ('professional', 'deliverable_submission', 'Deliverable submission', 'delivery_logistics', 17),
    ('professional', 'client_review', 'Client review', 'administration', 18),
    ('accounting', 'client_document_request', 'Client document request', 'administration', 10),
    ('accounting', 'source_document_receipt', 'Source-document receipt', 'administration', 11),
    ('accounting', 'transaction_processing', 'Transaction processing', 'production_operations', 12),
    ('accounting', 'reconciliation', 'Reconciliation', 'administration', 13),
    ('accounting', 'review_and_exception_resolution', 'Review and exception resolution', 'quality_compliance', 14),
    ('accounting', 'report_preparation', 'Report preparation', 'administration', 15),
    ('accounting', 'client_approval', 'Client approval', 'administration', 16),
    ('accounting', 'filing_or_submission_tracking', 'Filing or submission tracking', 'administration', 17),
    ('legal', 'client_intake_and_conflict_check', 'Client intake and conflict check', 'quality_compliance', 10),
    ('legal', 'matter_opening', 'Matter opening', 'service_delivery', 11),
    ('legal', 'engagement_and_scope', 'Engagement and scope', 'service_delivery', 12),
    ('legal', 'document_review', 'Document review', 'administration', 13),
    ('legal', 'research', 'Research', 'administration', 14),
    ('legal', 'consultation_or_hearing_preparation', 'Consultation or hearing preparation', 'sales_customer', 15),
    ('legal', 'milestone_update', 'Milestone update', 'service_delivery', 16),
    ('legal', 'billing_and_matter_closure', 'Billing and matter closure', 'administration', 17),
    ('marketing', 'client_briefing', 'Client briefing', 'administration', 10),
    ('marketing', 'campaign_strategy', 'Campaign strategy', 'administration', 11),
    ('marketing', 'content_calendar_approval', 'Content/calendar approval', 'administration', 12),
    ('marketing', 'creative_production', 'Creative production', 'production_operations', 13),
    ('marketing', 'campaign_launch', 'Campaign launch', 'administration', 14),
    ('marketing', 'performance_monitoring', 'Performance monitoring', 'quality_compliance', 15),
    ('marketing', 'optimisation', 'Optimisation', 'service_delivery', 16),
    ('marketing', 'client_report', 'Client report', 'administration', 17),
    ('marketing', 'campaign_close', 'Campaign close', 'administration', 18),
    ('design_agency', 'brief_capture', 'Brief capture', 'administration', 10),
    ('design_agency', 'discovery_and_requirements', 'Discovery and requirements', 'service_delivery', 11),
    ('design_agency', 'concept_development', 'Concept development', 'production_operations', 12),
    ('design_agency', 'client_review', 'Client review', 'administration', 13),
    ('design_agency', 'revisions', 'Revisions', 'service_delivery', 14),
    ('design_agency', 'final_approval', 'Final approval', 'administration', 15),
    ('design_agency', 'asset_handover', 'Asset handover', 'service_delivery', 16),
    ('design_agency', 'project_close', 'Project close', 'administration', 17),
    ('business_admin', 'client_request_intake', 'Client request intake', 'sales_customer', 10),
    ('business_admin', 'task_allocation', 'Task allocation', 'workforce', 11),
    ('business_admin', 'document_preparation', 'Document preparation', 'administration', 12),
    ('business_admin', 'records_update', 'Records update', 'administration', 13),
    ('business_admin', 'submission_or_follow_up', 'Submission or follow-up', 'sales_customer', 14),
    ('business_admin', 'deadline_tracking', 'Deadline tracking', 'administration', 15),
    ('business_admin', 'quality_review', 'Quality review', 'quality_compliance', 16),
    ('business_admin', 'completion_confirmation', 'Completion confirmation', 'service_delivery', 17),
    ('recruitment', 'client_vacancy_intake', 'Client vacancy intake', 'sales_customer', 10),
    ('recruitment', 'role_specification', 'Role specification', 'service_delivery', 11),
    ('recruitment', 'candidate_sourcing', 'Candidate sourcing', 'service_delivery', 12),
    ('recruitment', 'screening', 'Screening', 'service_delivery', 13),
    ('recruitment', 'interviews', 'Interviews', 'service_delivery', 14),
    ('recruitment', 'reference_checks', 'Reference checks', 'quality_compliance', 15),
    ('recruitment', 'shortlist_submission', 'Shortlist submission', 'service_delivery', 16),
    ('recruitment', 'placement_follow_up', 'Placement follow-up', 'sales_customer', 17),
    ('freelance', 'client_enquiry', 'Client enquiry', 'sales_customer', 10),
    ('freelance', 'scope_and_quote', 'Scope and quote', 'sales_customer', 11),
    ('freelance', 'work_scheduling', 'Work scheduling', 'administration', 12),
    ('freelance', 'task_execution', 'Task execution', 'service_delivery', 13),
    ('freelance', 'draft_submission', 'Draft submission', 'service_delivery', 14),
    ('freelance', 'revisions', 'Revisions', 'service_delivery', 15),
    ('freelance', 'final_delivery', 'Final delivery', 'delivery_logistics', 16),
    ('freelance', 'time_tracking', 'Time tracking', 'workforce', 17),
    ('freelance', 'client_feedback', 'Client feedback', 'sales_customer', 18),
    ('real_estate', 'property_listing_intake', 'Property listing intake', 'administration', 10),
    ('real_estate', 'property_inspection', 'Property inspection', 'quality_compliance', 11),
    ('real_estate', 'listing_publication', 'Listing publication', 'administration', 12),
    ('real_estate', 'enquiry_handling', 'Enquiry handling', 'sales_customer', 13),
    ('real_estate', 'viewing', 'Viewing', 'sales_customer', 14),
    ('real_estate', 'offer_negotiation', 'Offer negotiation', 'sales_customer', 15),
    ('real_estate', 'lease_or_sale_documentation', 'Lease or sale documentation', 'administration', 16),
    ('real_estate', 'handover', 'Handover', 'service_delivery', 17),
    ('real_estate', 'maintenance_follow_up', 'Maintenance follow-up', 'assets_maintenance', 18),
    ('building_contractor', 'site_assessment', 'Site assessment', 'service_delivery', 10),
    ('building_contractor', 'estimate_and_quotation', 'Estimate and quotation', 'sales_customer', 11),
    ('building_contractor', 'work_programme', 'Work programme', 'service_delivery', 12),
    ('building_contractor', 'site_mobilisation', 'Site mobilisation', 'service_delivery', 13),
    ('building_contractor', 'materials_receipt', 'Materials receipt', 'purchasing', 14),
    ('building_contractor', 'work_stage_completion', 'Work-stage completion', 'service_delivery', 15),
    ('building_contractor', 'safety_inspection', 'Safety inspection', 'quality_compliance', 16),
    ('building_contractor', 'variation_approval', 'Variation approval', 'administration', 17),
    ('building_contractor', 'handover', 'Handover', 'service_delivery', 18),
    ('plumbing', 'service_request', 'Service request', 'sales_customer', 10),
    ('plumbing', 'site_inspection', 'Site inspection', 'quality_compliance', 11),
    ('plumbing', 'diagnosis', 'Diagnosis', 'service_delivery', 12),
    ('plumbing', 'quotation', 'Quotation', 'sales_customer', 13),
    ('plumbing', 'parts_procurement', 'Parts procurement', 'purchasing', 14),
    ('plumbing', 'installation_or_repair', 'Installation or repair', 'assets_maintenance', 15),
    ('plumbing', 'pressure_leak_test', 'Pressure/leak test', 'quality_compliance', 16),
    ('plumbing', 'client_sign_off', 'Client sign-off', 'administration', 17),
    ('plumbing', 'follow_up', 'Follow-up', 'sales_customer', 18),
    ('electrical', 'service_request', 'Service request', 'sales_customer', 10),
    ('electrical', 'site_assessment', 'Site assessment', 'service_delivery', 11),
    ('electrical', 'safety_isolation', 'Safety isolation', 'quality_compliance', 12),
    ('electrical', 'diagnosis', 'Diagnosis', 'service_delivery', 13),
    ('electrical', 'materials_issue', 'Materials issue', 'stock_inventory', 14),
    ('electrical', 'installation_or_repair', 'Installation or repair', 'assets_maintenance', 15),
    ('electrical', 'testing_and_certification_where_applicable', 'Testing and certification where applicable', 'quality_compliance', 16),
    ('electrical', 'client_handover', 'Client handover', 'sales_customer', 17),
    ('carpentry', 'client_measurement', 'Client measurement', 'sales_customer', 10),
    ('carpentry', 'design_specification', 'Design/specification', 'production_operations', 11),
    ('carpentry', 'material_selection', 'Material selection', 'purchasing', 12),
    ('carpentry', 'cutting_and_fabrication', 'Cutting and fabrication', 'production_operations', 13),
    ('carpentry', 'assembly', 'Assembly', 'production_operations', 14),
    ('carpentry', 'finishing', 'Finishing', 'production_operations', 15),
    ('carpentry', 'installation', 'Installation', 'service_delivery', 16),
    ('carpentry', 'quality_check', 'Quality check', 'quality_compliance', 17),
    ('carpentry', 'handover', 'Handover', 'service_delivery', 18),
    ('welding', 'job_specification', 'Job specification', 'service_delivery', 10),
    ('welding', 'measurements', 'Measurements', 'service_delivery', 11),
    ('welding', 'material_preparation', 'Material preparation', 'production_operations', 12),
    ('welding', 'cutting', 'Cutting', 'production_operations', 13),
    ('welding', 'welding_fabrication', 'Welding/fabrication', 'production_operations', 14),
    ('welding', 'inspection', 'Inspection', 'quality_compliance', 15),
    ('welding', 'finishing', 'Finishing', 'production_operations', 16),
    ('welding', 'installation_or_dispatch', 'Installation or dispatch', 'delivery_logistics', 17),
    ('welding', 'job_sign_off', 'Job sign-off', 'administration', 18),
    ('painting', 'site_inspection', 'Site inspection', 'quality_compliance', 10),
    ('painting', 'surface_preparation', 'Surface preparation', 'production_operations', 11),
    ('painting', 'material_estimation', 'Material estimation', 'service_delivery', 12),
    ('painting', 'masking_protection', 'Masking/protection', 'service_delivery', 13),
    ('painting', 'priming', 'Priming', 'production_operations', 14),
    ('painting', 'coating', 'Coating', 'production_operations', 15),
    ('painting', 'finishing_inspection', 'Finishing inspection', 'quality_compliance', 16),
    ('painting', 'site_clean_up', 'Site clean-up', 'service_delivery', 17),
    ('painting', 'client_sign_off', 'Client sign-off', 'administration', 18),
    ('tiling', 'site_measurement', 'Site measurement', 'service_delivery', 10),
    ('tiling', 'substrate_preparation', 'Substrate preparation', 'production_operations', 11),
    ('tiling', 'tile_material_calculation', 'Tile/material calculation', 'service_delivery', 12),
    ('tiling', 'layout', 'Layout', 'production_operations', 13),
    ('tiling', 'cutting_and_installation', 'Cutting and installation', 'production_operations', 14),
    ('tiling', 'grouting', 'Grouting', 'production_operations', 15),
    ('tiling', 'finishing_inspection', 'Finishing inspection', 'quality_compliance', 16),
    ('tiling', 'clean_up', 'Clean-up', 'service_delivery', 17),
    ('tiling', 'handover', 'Handover', 'service_delivery', 18),
    ('installation', 'customer_request', 'Customer request', 'sales_customer', 10),
    ('installation', 'site_survey', 'Site survey', 'service_delivery', 11),
    ('installation', 'scope_and_quotation', 'Scope and quotation', 'sales_customer', 12),
    ('installation', 'equipment_material_preparation', 'Equipment/material preparation', 'assets_maintenance', 13),
    ('installation', 'installation', 'Installation', 'service_delivery', 14),
    ('installation', 'testing_and_commissioning', 'Testing and commissioning', 'quality_compliance', 15),
    ('installation', 'user_handover', 'User handover', 'service_delivery', 16),
    ('installation', 'warranty_follow_up', 'Warranty follow-up', 'sales_customer', 17),
    ('repairs_maintenance', 'fault_report', 'Fault report', 'administration', 10),
    ('repairs_maintenance', 'inspection', 'Inspection', 'quality_compliance', 11),
    ('repairs_maintenance', 'diagnosis', 'Diagnosis', 'service_delivery', 12),
    ('repairs_maintenance', 'work_order', 'Work order', 'sales_customer', 13),
    ('repairs_maintenance', 'parts_allocation', 'Parts allocation', 'stock_inventory', 14),
    ('repairs_maintenance', 'repair', 'Repair', 'assets_maintenance', 15),
    ('repairs_maintenance', 'functional_test', 'Functional test', 'quality_compliance', 16),
    ('repairs_maintenance', 'maintenance_history_update', 'Maintenance history update', 'assets_maintenance', 17),
    ('repairs_maintenance', 'closure', 'Closure', 'administration', 18),
    ('landscaping', 'site_assessment', 'Site assessment', 'service_delivery', 10),
    ('landscaping', 'design_quotation', 'Design/quotation', 'sales_customer', 11),
    ('landscaping', 'site_preparation', 'Site preparation', 'production_operations', 12),
    ('landscaping', 'planting', 'Planting', 'production_operations', 13),
    ('landscaping', 'irrigation_installation', 'Irrigation installation', 'production_operations', 14),
    ('landscaping', 'lawn_garden_maintenance', 'Lawn/garden maintenance', 'assets_maintenance', 15),
    ('landscaping', 'waste_removal', 'Waste removal', 'service_delivery', 16),
    ('landscaping', 'inspection', 'Inspection', 'quality_compliance', 17),
    ('landscaping', 'client_handover', 'Client handover', 'sales_customer', 18),
    ('taxi', 'trip_request', 'Trip request', 'delivery_logistics', 10),
    ('taxi', 'driver_and_vehicle_assignment', 'Driver and vehicle assignment', 'workforce', 11),
    ('taxi', 'pickup', 'Pickup', 'delivery_logistics', 12),
    ('taxi', 'trip_start_end', 'Trip start/end', 'delivery_logistics', 13),
    ('taxi', 'fare_capture', 'Fare capture', 'service_delivery', 14),
    ('taxi', 'fuel_or_distance_record', 'Fuel or distance record', 'assets_maintenance', 15),
    ('taxi', 'vehicle_inspection', 'Vehicle inspection', 'quality_compliance', 16),
    ('taxi', 'customer_feedback', 'Customer feedback', 'sales_customer', 17),
    ('public_transport', 'route_and_trip_scheduling', 'Route and trip scheduling', 'delivery_logistics', 10),
    ('public_transport', 'vehicle_driver_assignment', 'Vehicle/driver assignment', 'workforce', 11),
    ('public_transport', 'pre_trip_inspection', 'Pre-trip inspection', 'quality_compliance', 12),
    ('public_transport', 'passenger_boarding_count', 'Passenger boarding/count', 'delivery_logistics', 13),
    ('public_transport', 'departure_and_arrival', 'Departure and arrival', 'delivery_logistics', 14),
    ('public_transport', 'fare_reconciliation', 'Fare reconciliation', 'administration', 15),
    ('public_transport', 'incident_recording', 'Incident recording', 'quality_compliance', 16),
    ('public_transport', 'vehicle_servicing', 'Vehicle servicing', 'assets_maintenance', 17),
    ('vehicle_hire', 'reservation', 'Reservation', 'sales_customer', 10),
    ('vehicle_hire', 'customer_and_licence_verification', 'Customer and licence verification', 'quality_compliance', 11),
    ('vehicle_hire', 'vehicle_inspection', 'Vehicle inspection', 'quality_compliance', 12),
    ('vehicle_hire', 'handover', 'Handover', 'service_delivery', 13),
    ('vehicle_hire', 'rental_period_tracking', 'Rental period tracking', 'service_delivery', 14),
    ('vehicle_hire', 'return_inspection', 'Return inspection', 'quality_compliance', 15),
    ('vehicle_hire', 'fuel_mileage_check', 'Fuel/mileage check', 'quality_compliance', 16),
    ('vehicle_hire', 'damage_assessment', 'Damage assessment', 'quality_compliance', 17),
    ('vehicle_hire', 'deposit_refund_processing', 'Deposit/refund processing', 'sales_customer', 18),
    ('courier', 'pickup_request', 'Pickup request', 'delivery_logistics', 10),
    ('courier', 'parcel_acceptance_and_scan', 'Parcel acceptance and scan', 'delivery_logistics', 11),
    ('courier', 'route_assignment', 'Route assignment', 'delivery_logistics', 12),
    ('courier', 'dispatch', 'Dispatch', 'delivery_logistics', 13),
    ('courier', 'delivery_attempt', 'Delivery attempt', 'delivery_logistics', 14),
    ('courier', 'proof_of_delivery', 'Proof of delivery', 'delivery_logistics', 15),
    ('courier', 'failed_delivery_exception', 'Failed delivery exception', 'quality_compliance', 16),
    ('courier', 'return_to_sender', 'Return-to-sender', 'delivery_logistics', 17),
    ('courier', 'customer_notification', 'Customer notification', 'sales_customer', 18),
    ('freight', 'load_booking', 'Load booking', 'sales_customer', 10),
    ('freight', 'vehicle_and_driver_assignment', 'Vehicle and driver assignment', 'workforce', 11),
    ('freight', 'loading_and_weight_capture', 'Loading and weight capture', 'delivery_logistics', 12),
    ('freight', 'dispatch', 'Dispatch', 'delivery_logistics', 13),
    ('freight', 'trip_and_fuel_monitoring', 'Trip and fuel monitoring', 'quality_compliance', 14),
    ('freight', 'delivery_confirmation', 'Delivery confirmation', 'delivery_logistics', 15),
    ('freight', 'proof_of_delivery', 'Proof of delivery', 'delivery_logistics', 16),
    ('freight', 'vehicle_inspection', 'Vehicle inspection', 'quality_compliance', 17),
    ('freight', 'trip_costing', 'Trip costing', 'delivery_logistics', 18),
    ('logistics', 'shipment_request', 'Shipment request', 'delivery_logistics', 10),
    ('logistics', 'route_and_carrier_planning', 'Route and carrier planning', 'delivery_logistics', 11),
    ('logistics', 'booking_confirmation', 'Booking confirmation', 'sales_customer', 12),
    ('logistics', 'shipment_tracking', 'Shipment tracking', 'delivery_logistics', 13),
    ('logistics', 'exception_management', 'Exception management', 'quality_compliance', 14),
    ('logistics', 'delivery_confirmation', 'Delivery confirmation', 'delivery_logistics', 15),
    ('logistics', 'document_collection', 'Document collection', 'delivery_logistics', 16),
    ('logistics', 'client_status_report', 'Client status report', 'administration', 17),
    ('warehousing', 'goods_receiving', 'Goods receiving', 'purchasing', 10),
    ('warehousing', 'inspection', 'Inspection', 'quality_compliance', 11),
    ('warehousing', 'put_away', 'Put-away', 'stock_inventory', 12),
    ('warehousing', 'location_assignment', 'Location assignment', 'stock_inventory', 13),
    ('warehousing', 'stock_movement', 'Stock movement', 'stock_inventory', 14),
    ('warehousing', 'cycle_count', 'Cycle count', 'stock_inventory', 15),
    ('warehousing', 'picking', 'Picking', 'stock_inventory', 16),
    ('warehousing', 'dispatch', 'Dispatch', 'delivery_logistics', 17),
    ('warehousing', 'storage_condition_checks', 'Storage-condition checks', 'quality_compliance', 18),
    ('moving', 'customer_enquiry', 'Customer enquiry', 'sales_customer', 10),
    ('moving', 'site_survey', 'Site survey', 'service_delivery', 11),
    ('moving', 'quotation', 'Quotation', 'sales_customer', 12),
    ('moving', 'inventory_packing_plan', 'Inventory/packing plan', 'stock_inventory', 13),
    ('moving', 'packing', 'Packing', 'production_operations', 14),
    ('moving', 'loading', 'Loading', 'delivery_logistics', 15),
    ('moving', 'transport', 'Transport', 'delivery_logistics', 16),
    ('moving', 'unloading', 'Unloading', 'delivery_logistics', 17),
    ('moving', 'customer_sign_off', 'Customer sign-off', 'administration', 18),
    ('moving', 'damage_exception_report', 'Damage/exception report', 'quality_compliance', 19),
    ('food_processing', 'raw_material_receiving', 'Raw-material receiving', 'purchasing', 10),
    ('food_processing', 'batch_identification', 'Batch identification', 'production_operations', 11),
    ('food_processing', 'preparation', 'Preparation', 'production_operations', 12),
    ('food_processing', 'processing', 'Processing', 'production_operations', 13),
    ('food_processing', 'quality_and_food_safety_checks', 'Quality and food-safety checks', 'quality_compliance', 14),
    ('food_processing', 'yield_wastage_capture', 'Yield/wastage capture', 'production_operations', 15),
    ('food_processing', 'packaging', 'Packaging', 'production_operations', 16),
    ('food_processing', 'finished_goods_release', 'Finished-goods release', 'production_operations', 17),
    ('textiles', 'design_specification', 'Design/specification', 'production_operations', 10),
    ('textiles', 'material_receiving', 'Material receiving', 'purchasing', 11),
    ('textiles', 'cutting', 'Cutting', 'production_operations', 12),
    ('textiles', 'sewing_assembly', 'Sewing/assembly', 'production_operations', 13),
    ('textiles', 'finishing', 'Finishing', 'production_operations', 14),
    ('textiles', 'quality_inspection', 'Quality inspection', 'quality_compliance', 15),
    ('textiles', 'size_variant_recording', 'Size/variant recording', 'production_operations', 16),
    ('textiles', 'packing', 'Packing', 'production_operations', 17),
    ('textiles', 'production_output', 'Production output', 'production_operations', 18),
    ('furniture', 'customer_order_design', 'Customer order/design', 'sales_customer', 10),
    ('furniture', 'material_issuing', 'Material issuing', 'stock_inventory', 11),
    ('furniture', 'cutting', 'Cutting', 'production_operations', 12),
    ('furniture', 'machining', 'Machining', 'production_operations', 13),
    ('furniture', 'assembly', 'Assembly', 'production_operations', 14),
    ('furniture', 'finishing', 'Finishing', 'production_operations', 15),
    ('furniture', 'quality_inspection', 'Quality inspection', 'quality_compliance', 16),
    ('furniture', 'delivery_installation', 'Delivery/installation', 'delivery_logistics', 17),
    ('furniture', 'job_costing_inputs', 'Job costing inputs', 'administration', 18),
    ('crafts', 'order_design_request', 'Order/design request', 'sales_customer', 10),
    ('crafts', 'material_preparation', 'Material preparation', 'production_operations', 11),
    ('crafts', 'making_assembly', 'Making/assembly', 'production_operations', 12),
    ('crafts', 'quality_check', 'Quality check', 'quality_compliance', 13),
    ('crafts', 'finishing', 'Finishing', 'production_operations', 14),
    ('crafts', 'packaging', 'Packaging', 'production_operations', 15),
    ('crafts', 'finished_item_recording', 'Finished-item recording', 'production_operations', 16),
    ('crafts', 'dispatch', 'Dispatch', 'delivery_logistics', 17),
    ('cosmetics_production', 'formula_batch_planning', 'Formula/batch planning', 'administration', 10),
    ('cosmetics_production', 'ingredient_receiving', 'Ingredient receiving', 'purchasing', 11),
    ('cosmetics_production', 'weighing_and_mixing', 'Weighing and mixing', 'production_operations', 12),
    ('cosmetics_production', 'batch_processing', 'Batch processing', 'production_operations', 13),
    ('cosmetics_production', 'quality_checks', 'Quality checks', 'quality_compliance', 14),
    ('cosmetics_production', 'filling_and_labelling', 'Filling and labelling', 'production_operations', 15),
    ('cosmetics_production', 'batch_traceability', 'Batch traceability', 'production_operations', 16),
    ('cosmetics_production', 'finished_goods_release', 'Finished-goods release', 'production_operations', 17),
    ('metal_wood', 'job_specification', 'Job specification', 'production_operations', 10),
    ('metal_wood', 'material_receiving', 'Material receiving', 'purchasing', 11),
    ('metal_wood', 'cutting', 'Cutting', 'production_operations', 12),
    ('metal_wood', 'machining_fabrication', 'Machining/fabrication', 'production_operations', 13),
    ('metal_wood', 'assembly', 'Assembly', 'production_operations', 14),
    ('metal_wood', 'finishing', 'Finishing', 'production_operations', 15),
    ('metal_wood', 'inspection', 'Inspection', 'quality_compliance', 16),
    ('metal_wood', 'packing', 'Packing', 'production_operations', 17),
    ('metal_wood', 'dispatch', 'Dispatch', 'delivery_logistics', 18),
    ('packaging', 'customer_specification', 'Customer specification', 'sales_customer', 10),
    ('packaging', 'material_receiving', 'Material receiving', 'purchasing', 11),
    ('packaging', 'print_conversion_setup', 'Print/conversion setup', 'production_operations', 12),
    ('packaging', 'production_run', 'Production run', 'production_operations', 13),
    ('packaging', 'quality_checks', 'Quality checks', 'quality_compliance', 14),
    ('packaging', 'count_and_yield', 'Count and yield', 'stock_inventory', 15),
    ('packaging', 'packing', 'Packing', 'production_operations', 16),
    ('packaging', 'dispatch', 'Dispatch', 'delivery_logistics', 17),
    ('printing', 'job_brief', 'Job brief', 'administration', 10),
    ('printing', 'artwork_receipt_and_proof_approval', 'Artwork receipt and proof approval', 'administration', 11),
    ('printing', 'material_preparation', 'Material preparation', 'production_operations', 12),
    ('printing', 'print_setup', 'Print setup', 'production_operations', 13),
    ('printing', 'production', 'Production', 'production_operations', 14),
    ('printing', 'finishing_binding', 'Finishing/binding', 'production_operations', 15),
    ('printing', 'quality_check', 'Quality check', 'quality_compliance', 16),
    ('printing', 'job_packing', 'Job packing', 'production_operations', 17),
    ('printing', 'delivery', 'Delivery', 'delivery_logistics', 18),
    ('tutoring', 'learner_registration', 'Learner registration', 'sales_customer', 10),
    ('tutoring', 'subject_goal_assessment', 'Subject/goal assessment', 'service_delivery', 11),
    ('tutoring', 'lesson_scheduling', 'Lesson scheduling', 'administration', 12),
    ('tutoring', 'lesson_delivered', 'Lesson delivered', 'service_delivery', 13),
    ('tutoring', 'attendance', 'Attendance', 'workforce', 14),
    ('tutoring', 'homework_assessment', 'Homework/assessment', 'service_delivery', 15),
    ('tutoring', 'progress_review', 'Progress review', 'administration', 16),
    ('tutoring', 'parent_learner_feedback', 'Parent/learner feedback', 'sales_customer', 17),
    ('training_provider', 'course_enquiry', 'Course enquiry', 'sales_customer', 10),
    ('training_provider', 'learner_enrolment', 'Learner enrolment', 'sales_customer', 11),
    ('training_provider', 'course_scheduling', 'Course scheduling', 'administration', 12),
    ('training_provider', 'trainer_assignment', 'Trainer assignment', 'workforce', 13),
    ('training_provider', 'session_delivery', 'Session delivery', 'service_delivery', 14),
    ('training_provider', 'attendance', 'Attendance', 'workforce', 15),
    ('training_provider', 'assessment', 'Assessment', 'service_delivery', 16),
    ('training_provider', 'certificate_issuance', 'Certificate issuance', 'quality_compliance', 17),
    ('training_provider', 'course_evaluation', 'Course evaluation', 'service_delivery', 18),
    ('childcare', 'child_enrolment', 'Child enrolment', 'sales_customer', 10),
    ('childcare', 'authorised_pickup_details', 'Authorised pickup details', 'delivery_logistics', 11),
    ('childcare', 'daily_check_in_out', 'Daily check-in/out', 'sales_customer', 12),
    ('childcare', 'meals_and_activities', 'Meals and activities', 'production_operations', 13),
    ('childcare', 'nap_health_observations', 'Nap/health observations', 'service_delivery', 14),
    ('childcare', 'incident_recording', 'Incident recording', 'quality_compliance', 15),
    ('childcare', 'parent_communication', 'Parent communication', 'sales_customer', 16),
    ('childcare', 'daily_handover', 'Daily handover', 'service_delivery', 17),
    ('wellness', 'client_enquiry', 'Client enquiry', 'sales_customer', 10),
    ('wellness', 'intake_and_consent', 'Intake and consent', 'quality_compliance', 11),
    ('wellness', 'goal_setting', 'Goal setting', 'service_delivery', 12),
    ('wellness', 'session_booking', 'Session booking', 'sales_customer', 13),
    ('wellness', 'session_delivered', 'Session delivered', 'service_delivery', 14),
    ('wellness', 'progress_check', 'Progress check', 'quality_compliance', 15),
    ('wellness', 'follow_up_plan', 'Follow-up plan', 'administration', 16),
    ('wellness', 'client_feedback', 'Client feedback', 'sales_customer', 17),
    ('clinic', 'appointment_registration', 'Appointment registration', 'sales_customer', 10),
    ('clinic', 'patient_check_in', 'Patient check-in', 'sales_customer', 11),
    ('clinic', 'triage', 'Triage', 'service_delivery', 12),
    ('clinic', 'consultation', 'Consultation', 'sales_customer', 13),
    ('clinic', 'procedure_or_treatment_record', 'Procedure or treatment record', 'service_delivery', 14),
    ('clinic', 'referral', 'Referral', 'service_delivery', 15),
    ('clinic', 'follow_up_scheduling', 'Follow-up scheduling', 'administration', 16),
    ('clinic', 'stock_consumables_usage', 'Stock/consumables usage', 'stock_inventory', 17),
    ('counselling', 'enquiry_and_intake', 'Enquiry and intake', 'sales_customer', 10),
    ('counselling', 'consent_and_confidentiality_setup', 'Consent and confidentiality setup', 'quality_compliance', 11),
    ('counselling', 'appointment', 'Appointment', 'sales_customer', 12),
    ('counselling', 'session_delivered', 'Session delivered', 'service_delivery', 13),
    ('counselling', 'treatment_progress_note_under_authorised_control', 'Treatment/progress note under authorised controls', 'service_delivery', 14),
    ('counselling', 'follow_up_plan', 'Follow-up plan', 'administration', 15),
    ('counselling', 'attendance_and_billing_linkage', 'Attendance and billing linkage', 'workforce', 16),
    ('elder_care', 'client_assessment', 'Client assessment', 'sales_customer', 10),
    ('elder_care', 'care_plan_setup', 'Care-plan setup', 'administration', 11),
    ('elder_care', 'daily_care_tasks', 'Daily care tasks', 'service_delivery', 12),
    ('elder_care', 'medication_support_record_where_authorised', 'Medication support record where authorised', 'service_delivery', 13),
    ('elder_care', 'meals_and_wellbeing_checks', 'Meals and wellbeing checks', 'quality_compliance', 14),
    ('elder_care', 'incident_escalation', 'Incident escalation', 'quality_compliance', 15),
    ('elder_care', 'family_update', 'Family update', 'sales_customer', 16),
    ('elder_care', 'shift_handover', 'Shift handover', 'workforce', 17),
    ('it_services', 'client_enquiry', 'Client enquiry', 'sales_customer', 10),
    ('it_services', 'requirements_discovery', 'Requirements discovery', 'service_delivery', 11),
    ('it_services', 'solution_design', 'Solution design', 'production_operations', 12),
    ('it_services', 'development_task', 'Development task', 'production_operations', 13),
    ('it_services', 'testing', 'Testing', 'quality_compliance', 14),
    ('it_services', 'deployment', 'Deployment', 'service_delivery', 15),
    ('it_services', 'support_ticket', 'Support ticket', 'service_delivery', 16),
    ('it_services', 'service_review', 'Service review', 'administration', 17),
    ('it_services', 'project_closure', 'Project closure', 'administration', 18),
    ('digital_products', 'product_planning', 'Product planning', 'administration', 10),
    ('digital_products', 'content_asset_creation', 'Content/asset creation', 'production_operations', 11),
    ('digital_products', 'version_update', 'Version update', 'service_delivery', 12),
    ('digital_products', 'quality_testing', 'Quality testing', 'quality_compliance', 13),
    ('digital_products', 'product_publication', 'Product publication', 'administration', 14),
    ('digital_products', 'customer_access_delivery', 'Customer access/delivery', 'delivery_logistics', 15),
    ('digital_products', 'support_request', 'Support request', 'sales_customer', 16),
    ('digital_products', 'usage_performance_review', 'Usage/performance review', 'stock_inventory', 17),
    ('digital_marketing', 'client_onboarding', 'Client onboarding', 'sales_customer', 10),
    ('digital_marketing', 'channel_audit', 'Channel audit', 'service_delivery', 11),
    ('digital_marketing', 'content_planning', 'Content planning', 'administration', 12),
    ('digital_marketing', 'creative_approval', 'Creative approval', 'administration', 13),
    ('digital_marketing', 'campaign_setup', 'Campaign setup', 'administration', 14),
    ('digital_marketing', 'publishing', 'Publishing', 'administration', 15),
    ('digital_marketing', 'analytics_review', 'Analytics review', 'administration', 16),
    ('digital_marketing', 'optimisation', 'Optimisation', 'service_delivery', 17),
    ('digital_marketing', 'monthly_report', 'Monthly report', 'administration', 18),
    ('media_production', 'brief_and_concept', 'Brief and concept', 'administration', 10),
    ('media_production', 'pre_production_planning', 'Pre-production planning', 'administration', 11),
    ('media_production', 'shoot_recording', 'Shoot/recording', 'production_operations', 12),
    ('media_production', 'editing', 'Editing', 'production_operations', 13),
    ('media_production', 'client_review', 'Client review', 'administration', 14),
    ('media_production', 'revisions', 'Revisions', 'service_delivery', 15),
    ('media_production', 'final_approval', 'Final approval', 'administration', 16),
    ('media_production', 'publishing_delivery', 'Publishing/delivery', 'delivery_logistics', 17),
    ('media_production', 'asset_archiving', 'Asset archiving', 'assets_maintenance', 18),
    ('photography', 'client_enquiry', 'Client enquiry', 'sales_customer', 10),
    ('photography', 'brief_and_shot_list', 'Brief and shot list', 'administration', 11),
    ('photography', 'booking', 'Booking', 'sales_customer', 12),
    ('photography', 'shoot', 'Shoot', 'production_operations', 13),
    ('photography', 'media_backup', 'Media backup', 'assets_maintenance', 14),
    ('photography', 'editing', 'Editing', 'production_operations', 15),
    ('photography', 'proof_review', 'Proof review', 'administration', 16),
    ('photography', 'final_delivery', 'Final delivery', 'delivery_logistics', 17),
    ('photography', 'usage_licence_confirmation', 'Usage/licence confirmation', 'stock_inventory', 18),
    ('entertainment', 'booking_or_event_enquiry', 'Booking or event enquiry', 'sales_customer', 10),
    ('entertainment', 'event_planning', 'Event planning', 'administration', 11),
    ('entertainment', 'performer_crew_assignment', 'Performer/crew assignment', 'workforce', 12),
    ('entertainment', 'rehearsal', 'Rehearsal', 'workforce', 13),
    ('entertainment', 'event_setup', 'Event setup', 'production_operations', 14),
    ('entertainment', 'performance', 'Performance', 'administration', 15),
    ('entertainment', 'ticket_attendance_tracking', 'Ticket/attendance tracking', 'workforce', 16),
    ('entertainment', 'settlement', 'Settlement', 'administration', 17),
    ('entertainment', 'event_close', 'Event close', 'administration', 18),
    ('online_services', 'customer_registration', 'Customer registration', 'sales_customer', 10),
    ('online_services', 'service_request', 'Service request', 'sales_customer', 11),
    ('online_services', 'order_or_subscription_activation', 'Order or subscription activation', 'sales_customer', 12),
    ('online_services', 'service_delivery', 'Service delivery', 'service_delivery', 13),
    ('online_services', 'support_ticket', 'Support ticket', 'service_delivery', 14),
    ('online_services', 'renewal', 'Renewal', 'sales_customer', 15),
    ('online_services', 'usage_review', 'Usage review', 'stock_inventory', 16),
    ('online_services', 'cancellation_closure', 'Cancellation/closure', 'administration', 17)
,
    -- The catalogue lists no activities for these two, so they start with general ones.
    ('other_manufacturing', 'production_run', 'Production run', 'production_operations', 10),
    ('other_manufacturing', 'materials_received', 'Materials received', 'purchasing', 11),
    ('other_manufacturing', 'quality_check', 'Quality check', 'quality_compliance', 12),
    ('other_manufacturing', 'dispatch', 'Dispatch', 'delivery_logistics', 13),
    ('other_care', 'client_intake', 'Client intake and consent', 'sales_customer', 10),
    ('other_care', 'session_delivered', 'Session delivered', 'service_delivery', 11),
    ('other_care', 'incident_record', 'Incident record', 'quality_compliance', 12),
    ('other_care', 'follow_up', 'Follow-up', 'sales_customer', 13)
  ) as v (industry_code, code, name, group_code, sort_order)
on conflict (industry_code, code) do nothing;
