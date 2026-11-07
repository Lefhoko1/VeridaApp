-- FR-I12: platform roles and the business permission matrix are managed through these functions.

create function authz.require_platform_role(p_role text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not authz.has_platform_role(p_role) then
    raise exception 'This requires the % role.', replace(p_role, '_', ' ') using errcode = '42501';
  end if;
end $$;

create function authz.admin_list_platform_roles()
returns table (user_id uuid, full_name text, email text, role text, granted_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  return query
    select a.user_id, p.full_name, p.email, a.role, a.granted_at
      from authz.platform_role_assignments a
      join identity.profiles p on p.id = a.user_id
     order by a.role, p.full_name;
end $$;

create function authz.admin_grant_platform_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
begin
  perform authz.require_platform_role('administrator');
  select id into target from identity.profiles where lower(email) = lower(trim(p_email));
  if target is null then
    raise exception 'No account uses this email address.' using errcode = 'P0002';
  end if;
  insert into authz.platform_role_assignments (user_id, role, granted_by)
  values (target, p_role, auth.uid())
  on conflict (user_id, role) do nothing;
end $$;

create function authz.admin_revoke_platform_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  -- Without an administrator, only direct database access could restore this screen.
  if p_role = 'administrator'
     and (select count(*) from authz.platform_role_assignments where role = 'administrator') <= 1 then
    raise exception 'The platform must keep at least one administrator.' using errcode = 'P0001';
  end if;
  delete from authz.platform_role_assignments where user_id = p_user_id and role = p_role;
end $$;

create function authz.admin_set_role_permission(p_role text, p_permission text, p_allowed boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  -- Owners keep every permission, so a business can always be managed by its owner.
  if p_role = 'owner' then
    raise exception 'The owner role always has every permission.' using errcode = 'P0001';
  end if;
  if p_allowed then
    insert into authz.role_permissions (role, permission) values (p_role, p_permission)
    on conflict do nothing;
  else
    delete from authz.role_permissions where role = p_role and permission = p_permission;
  end if;
end $$;

grant execute on function authz.require_platform_role(text) to authenticated;
grant execute on function authz.admin_list_platform_roles() to authenticated;
grant execute on function authz.admin_grant_platform_role(text, text) to authenticated;
grant execute on function authz.admin_revoke_platform_role(uuid, text) to authenticated;
grant execute on function authz.admin_set_role_permission(text, text, boolean) to authenticated;

-- FR-I11: changes to who can do what are themselves audited.
create trigger capture_change after insert or update or delete on authz.platform_role_assignments
  for each row execute function audit.capture_change();
create trigger capture_change after insert or update or delete on authz.role_permissions
  for each row execute function audit.capture_change();
