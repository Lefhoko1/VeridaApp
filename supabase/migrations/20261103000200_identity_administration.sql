-- FR-A22 to FR-A27: user administration. Profiles stay private to their owner under RLS,
-- so administrators reach them only through these role-checked functions.

create function identity.admin_search_users(
  p_query text default null, p_status text default null,
  p_from date default null, p_to date default null, p_limit int default 100
)
returns table (id uuid, full_name text, email text, phone text, account_status text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  return query
    select p.id, p.full_name, p.email, p.phone, p.account_status, p.created_at
      from identity.profiles p
     where (nullif(trim(p_query), '') is null
            or p.full_name ilike '%' || trim(p_query) || '%'
            or p.email ilike '%' || trim(p_query) || '%')
       and (p_status is null or p.account_status = p_status)
       and (p_from is null or p.created_at::date >= p_from)
       and (p_to is null or p.created_at::date <= p_to)
     order by p.created_at desc
     limit least(greatest(p_limit, 1), 500);
end $$;

create function identity.admin_get_user(p_id uuid)
returns table (
  id uuid, full_name text, email text, phone text, account_status text, created_at timestamptz,
  email_confirmed boolean, last_sign_in_at timestamptz, platform_roles text[], business_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  return query
    select p.id, p.full_name, p.email, p.phone, p.account_status, p.created_at,
           u.email_confirmed_at is not null, u.last_sign_in_at,
           coalesce((select array_agg(a.role order by a.role) from authz.platform_role_assignments a where a.user_id = p.id), '{}'),
           (select count(*) from business.memberships m where m.user_id = p.id and m.status = 'active')
      from identity.profiles p
      join auth.users u on u.id = p.id
     where p.id = p_id;
end $$;

create function identity.admin_update_user(p_id uuid, p_full_name text, p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  update identity.profiles set full_name = trim(p_full_name), phone = p_phone, updated_at = now() where id = p_id;
  if not found then
    raise exception 'This user could not be found.' using errcode = 'P0002';
  end if;
end $$;

-- FR-A26. Also the only route back for an account its owner deactivated (FR-A20).
create function identity.admin_set_user_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  if p_status not in ('active', 'suspended') then
    raise exception 'An account can only be suspended or reactivated here.' using errcode = '23514';
  end if;
  if p_id = auth.uid() then
    raise exception 'You cannot change the status of your own account.' using errcode = 'P0001';
  end if;
  update identity.profiles set account_status = p_status, updated_at = now() where id = p_id;
  if not found then
    raise exception 'This user could not be found.' using errcode = 'P0002';
  end if;
end $$;

-- FR-A27: flags the account. Erasure itself follows the retention policy.
create function identity.admin_initiate_deletion(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  if p_id = auth.uid() then
    raise exception 'You cannot delete your own account here.' using errcode = 'P0001';
  end if;
  update identity.profiles set account_status = 'deletion_requested', updated_at = now() where id = p_id;
  if not found then
    raise exception 'This user could not be found.' using errcode = 'P0002';
  end if;
end $$;

grant execute on function identity.admin_search_users(text, text, date, date, int) to authenticated;
grant execute on function identity.admin_get_user(uuid) to authenticated;
grant execute on function identity.admin_update_user(uuid, text, text) to authenticated;
grant execute on function identity.admin_set_user_status(uuid, text) to authenticated;
grant execute on function identity.admin_initiate_deletion(uuid) to authenticated;

create trigger capture_change after update on identity.profiles
  for each row execute function audit.capture_change();
