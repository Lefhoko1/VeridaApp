-- A business can be more than one type, as the project owner asked: a farm that also runs a shop.
-- industry_code stays the main type, which chooses the dashboard's highlights and lesson content.
-- Every type contributes its categories, activities and measures.
alter table business.businesses
  add column additional_industries text[] not null default '{}',
  add column other_type text;

alter table business.businesses
  add constraint businesses_other_type_length check (char_length(other_type) <= 80);

grant update (additional_industries, other_type) on business.businesses to authenticated;

create function business.all_industries(p_main text, p_additional text[]) returns text[]
language sql immutable set search_path = '' as $$
  select array_prepend(p_main, coalesce(p_additional, '{}'));
$$;
grant execute on function business.all_industries(text, text[]) to authenticated;

-- There is no foreign key on an array, so this keeps the list valid.
create function business.normalise_business_types() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  listed text[];
begin
  select coalesce(array_agg(distinct_codes.wanted order by distinct_codes.first_seen), '{}') into listed
    from (select t.wanted, min(t.seen) as first_seen
            from unnest(new.additional_industries) with ordinality as t (wanted, seen)
           where t.wanted <> new.industry_code
           group by t.wanted) distinct_codes;
  -- A type that has since been retired can stay on a business that already has it.
  if tg_op = 'INSERT' or new.additional_industries is distinct from old.additional_industries then
    if exists (select 1 from unnest(listed) as l (wanted)
                where not exists (select 1 from platform.industries i where i.code = l.wanted and i.is_active)
                  and (tg_op = 'INSERT' or l.wanted <> all (old.additional_industries))) then
      raise exception 'Choose a supported business type.' using errcode = '23514';
    end if;
  end if;
  new.additional_industries := listed;
  new.other_type := nullif(trim(new.other_type), '');
  return new;
end $$;

create trigger normalise_business_types before insert or update of industry_code, additional_industries, other_type
  on business.businesses
  for each row execute function business.normalise_business_types();

drop function business.register_business(text, text, text, text, text, text, text, text, text);

create function business.register_business(
  p_name text, p_industry_code text, p_stage text, p_size text, p_country text,
  p_location text, p_currency text, p_main_goal text, p_record_keeping text,
  p_additional_industries text[] default '{}', p_other_type text default null
) returns business.businesses
language plpgsql security definer set search_path = '' as $$
declare
  created business.businesses;
begin
  if not exists (select 1 from identity.profiles
                  where id = auth.uid() and account_status = 'active') then
    raise exception 'Verify your account before registering a business.' using errcode = '42501';
  end if;
  if not exists (select 1 from platform.industries where code = p_industry_code and is_active) then
    raise exception 'Choose a supported business type.' using errcode = '23514';
  end if;

  insert into business.businesses
    (name, industry_code, stage, size, country, location, currency, main_goal, record_keeping, additional_industries, other_type)
  values
    (trim(p_name), p_industry_code, p_stage, p_size, p_country, p_location, p_currency, p_main_goal, p_record_keeping,
     coalesce(p_additional_industries, '{}'), p_other_type)
  returning * into created;

  insert into business.memberships (business_id, user_id, role)
  values (created.id, auth.uid(), 'owner');

  return created;
end $$;
grant execute on function business.register_business(text, text, text, text, text, text, text, text, text, text[], text) to authenticated;

drop function business.my_workspaces();

create function business.my_workspaces()
returns table (
  id uuid, name text, industry_code text, stage text, size text, country text, location text,
  currency text, main_goal text, record_keeping text, status text, my_role text,
  additional_industries text[], other_type text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select b.id, b.name, b.industry_code, b.stage, b.size, b.country, b.location, b.currency,
           b.main_goal, b.record_keeping, b.status, m.role, b.additional_industries, b.other_type
      from business.memberships m
      join business.businesses b on b.id = m.business_id
     where m.user_id = auth.uid() and m.status = 'active' and b.status <> 'deletion_requested'
     order by b.name;
end $$;
grant execute on function business.my_workspaces() to authenticated;

-- Categories from every type the business has, each name once.
create or replace function records.list_categories(p_business_id uuid, p_kind text) returns setof text
language plpgsql stable set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'records.view');
  return query
    select merged.name from (
      select c.name, c.sort_order, 0 as source
        from platform.record_categories c
        join business.businesses b on c.industry_code = any (business.all_industries(b.industry_code, b.additional_industries))
       where b.id = p_business_id and c.kind = p_kind
      union all
      select cc.name, 0, 1
        from records.custom_categories cc
       where cc.business_id = p_business_id and cc.kind = p_kind
    ) merged
    group by merged.name
    order by min(merged.source), min(merged.sort_order), merged.name;
end $$;

create or replace function operations.validate_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  config platform.activity_types;
begin
  select t.* into config
    from platform.activity_types t
    join business.businesses b on t.industry_code = any (business.all_industries(b.industry_code, b.additional_industries))
   where t.id = new.activity_type_id and b.id = new.business_id;
  if not found then
    raise exception 'This activity is not available for this type of business.' using errcode = '23514';
  end if;

  -- A rule added later must not stop an older record being voided, which leaves these fields alone.
  if tg_op = 'UPDATE'
     and (new.activity_type_id, new.quantity, new.unit, new.notes)
         is not distinct from (old.activity_type_id, old.quantity, old.unit, old.notes) then
    return new;
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
  if config.notes_required and coalesce(trim(new.notes), '') = '' then
    raise exception '% needs a note.', config.name using errcode = '23514';
  end if;
  if cardinality(config.allowed_units) > 0
     and not exists (select 1 from unnest(config.allowed_units) u where lower(u) = lower(trim(new.unit))) then
    raise exception '% must use one of these units: %.', config.name, array_to_string(config.allowed_units, ', ')
      using errcode = '23514';
  end if;
  return new;
end $$;

-- FR-B09, now per type: a type can go only while no activity record depends on it.
create or replace function operations.guard_industry_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1
               from operations.activity_records r
               join platform.activity_types t on t.id = r.activity_type_id
              where r.business_id = new.id
                and t.industry_code <> all (business.all_industries(new.industry_code, new.additional_industries))) then
    raise exception 'The business type cannot change once operational records exist. You can still add types.' using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger guard_industry_change on business.businesses;
create trigger guard_industry_change before update of industry_code, additional_industries on business.businesses
  for each row execute function operations.guard_industry_change();

-- Measures from every type, each once. Only the main type's highlights lead the dashboard, so
-- that several types don't crowd it. The rest appear under its other measures.
create or replace function analytics.compute_kpis(p_business_id uuid, p_from date, p_to date)
returns table (
  code text, name text, explanation text, formula_text text, required_data text, unit_kind text,
  is_highlight boolean, value numeric, status text, note text, period_from date, period_to date
)
language plpgsql stable set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'analytics.view');
  if p_from > p_to then
    raise exception 'The reporting period start must be before its end.' using errcode = '22023';
  end if;

  return query
    select d.code, d.name, d.explanation, d.formula_text, d.required_data, d.unit_kind,
           (k.is_highlight and k.type_order = 1), e.value, e.status, e.note, p_from, p_to
      from (
        select distinct on (ik.kpi_code) ik.kpi_code, ik.is_highlight, ik.sort_order, t.type_order
          from business.businesses b
         cross join lateral unnest(business.all_industries(b.industry_code, b.additional_industries))
               with ordinality as t (industry_code, type_order)
          join platform.industry_kpis ik on ik.industry_code = t.industry_code
         where b.id = p_business_id
         order by ik.kpi_code, t.type_order
      ) k
      join platform.kpi_definitions d on d.code = k.kpi_code
     cross join lateral analytics.evaluate_kpi(p_business_id, p_from, p_to, d.formula, d.activity_code) e
     order by k.type_order, k.sort_order;
end $$;
