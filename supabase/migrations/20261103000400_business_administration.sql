-- FR-B14 to FR-B18: business administration, and the owner's view of a business's change history.

create function business.admin_search_businesses(
  p_query text default null, p_industry text default null, p_location text default null,
  p_status text default null, p_limit int default 100
)
returns table (
  id uuid, name text, industry_code text, location text, country text, status text,
  owner_email text, member_count bigint, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  return query
    select b.id, b.name, b.industry_code, b.location, b.country, b.status,
           (select p.email from business.memberships m join identity.profiles p on p.id = m.user_id
             where m.business_id = b.id and m.role = 'owner' limit 1),
           (select count(*) from business.memberships m where m.business_id = b.id and m.status = 'active'),
           b.created_at
      from business.businesses b
     where (nullif(trim(p_query), '') is null or b.name ilike '%' || trim(p_query) || '%')
       and (p_industry is null or b.industry_code = p_industry)
       and (nullif(trim(p_location), '') is null
            or b.location ilike '%' || trim(p_location) || '%'
            or b.country ilike '%' || trim(p_location) || '%')
       and (p_status is null or b.status = p_status)
     order by b.created_at desc
     limit least(greatest(p_limit, 1), 500);
end $$;

create function business.admin_get_business(p_id uuid)
returns table (
  id uuid, name text, industry_code text, stage text, size text, country text, location text,
  currency text, main_goal text, status text, owner_email text, member_count bigint, created_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  return query
    select b.id, b.name, b.industry_code, b.stage, b.size, b.country, b.location, b.currency, b.main_goal, b.status,
           (select p.email from business.memberships m join identity.profiles p on p.id = m.user_id
             where m.business_id = b.id and m.role = 'owner' limit 1),
           (select count(*) from business.memberships m where m.business_id = b.id and m.status = 'active'),
           b.created_at
      from business.businesses b
     where b.id = p_id;
end $$;

-- FR-B17: configuration only. The owner's name and goals stay theirs to change.
create function business.admin_update_configuration(
  p_id uuid, p_industry_code text, p_stage text, p_size text, p_currency text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  update business.businesses
     set industry_code = p_industry_code, stage = p_stage, size = p_size, currency = p_currency
   where id = p_id;
  if not found then
    raise exception 'This business could not be found.' using errcode = 'P0002';
  end if;
end $$;

-- FR-B18.
create function business.admin_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  if p_status not in ('active', 'suspended') then
    raise exception 'A business can only be suspended or reactivated here.' using errcode = '23514';
  end if;
  update business.businesses set status = p_status where id = p_id;
  if not found then
    raise exception 'This business could not be found.' using errcode = 'P0002';
  end if;
end $$;

-- FR-C11: an owner can read their own business's change history.
create function business.change_history(p_business_id uuid, p_limit int default 100)
returns table (
  id bigint, occurred_at timestamptz, table_name text, action text, actor_name text, changed_fields text[]
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'audit.view');
  return query
    select c.id, c.occurred_at, c.table_name, c.action, p.full_name,
           coalesce((
             select array_agg(n.key order by n.key)
               from jsonb_each(coalesce(c.new_data, '{}'::jsonb)) n
              where n.key not in ('updated_at', 'updated_by', 'created_at', 'created_by')
                and n.value is distinct from coalesce(c.old_data, '{}'::jsonb) -> n.key
           ), '{}')
      from audit.record_changes c
      left join identity.profiles p on p.id = c.actor_id
     where c.business_id = p_business_id
     order by c.occurred_at desc, c.id desc
     limit least(greatest(p_limit, 1), 500);
end $$;

grant execute on function business.admin_search_businesses(text, text, text, text, int) to authenticated;
grant execute on function business.admin_get_business(uuid) to authenticated;
grant execute on function business.admin_update_configuration(uuid, text, text, text, text) to authenticated;
grant execute on function business.admin_set_status(uuid, text) to authenticated;
grant execute on function business.change_history(uuid, int) to authenticated;
