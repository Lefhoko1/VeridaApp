-- FR-I07: administrators configure more of what counts as a valid activity record.

alter table platform.activity_types
  add column min_quantity numeric,
  add column whole_numbers_only boolean not null default false,
  add column notes_required boolean not null default false,
  add column allowed_units text[] not null default '{}';

alter table platform.activity_types
  add constraint activity_types_quantity_range_check
  check (min_quantity is null or max_quantity is null or min_quantity <= max_quantity);

create or replace function operations.validate_activity() returns trigger
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
