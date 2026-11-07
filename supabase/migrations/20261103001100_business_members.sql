-- FR-B13, FR-B22, FR-B23: a member's own permissions, ownership transfer, and the same team
-- management for Verida staff supporting a business.

alter table business.businesses add column deletion_requested_at timestamptz;
update business.businesses set deletion_requested_at = updated_at where status = 'deletion_requested';

create function business.stamp_deletion_request() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'deletion_requested' then
    new.deletion_requested_at := coalesce(old.deletion_requested_at, now());
  else
    new.deletion_requested_at := null;
  end if;
  return new;
end $$;

create trigger stamp_deletion_request before update of status on business.businesses
  for each row execute function business.stamp_deletion_request();

create unique index memberships_one_owner_idx on business.memberships (business_id)
  where role = 'owner' and status = 'active';

-- A new role is a fresh start, so personal permissions don't silently carry across.
create function business.clear_overrides_on_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.role is distinct from old.role or new.status is distinct from old.status then
    delete from authz.member_permission_overrides
     where business_id = new.business_id and user_id = new.user_id;
  end if;
  return new;
end $$;

create trigger clear_overrides_on_change after update of role, status on business.memberships
  for each row execute function business.clear_overrides_on_change();

-- Replaces the original: holding members.manage through a personal override must not let someone
-- raise their own access.
create or replace function business.change_member_role(p_business_id uuid, p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'members.manage');
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role.' using errcode = 'P0001';
  end if;
  if p_role = 'owner' then
    raise exception 'Ownership cannot be assigned here.' using errcode = '23514';
  end if;
  update business.memberships set role = p_role
   where business_id = p_business_id and user_id = p_user_id and status = 'active' and role <> 'owner';
  if not found then
    raise exception 'This member''s role cannot be changed.' using errcode = 'P0001';
  end if;
end $$;

-- What one member can do and why. Members may also read their own.
create function business.permissions_of(p_business_id uuid, p_user_id uuid)
returns table (permission text, description text, from_role boolean, override boolean, allowed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select c.code, c.description, rp.permission is not null, o.allowed, coalesce(o.allowed, rp.permission is not null)
      from authz.permissions c
      join business.memberships m on m.business_id = p_business_id and m.user_id = p_user_id and m.status = 'active'
      left join authz.role_permissions rp on rp.role = m.role and rp.permission = c.code
      left join authz.member_permission_overrides o
        on o.business_id = p_business_id and o.user_id = p_user_id and o.permission = c.code
     order by c.code;
end $$;

create function business.member_permissions(p_business_id uuid, p_user_id uuid)
returns table (permission text, description text, from_role boolean, override boolean, allowed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_user_id <> auth.uid() then
    perform authz.require_business_permission(p_business_id, 'members.manage');
  end if;
  return query select * from business.permissions_of(p_business_id, p_user_id);
end $$;

create function business.apply_member_permission(
  p_business_id uuid, p_user_id uuid, p_permission text, p_allowed boolean
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from business.memberships
                  where business_id = p_business_id and user_id = p_user_id
                    and status = 'active' and role <> 'owner') then
    raise exception 'This member''s permissions cannot be changed. An owner always has every permission.'
      using errcode = 'P0001';
  end if;
  if p_allowed is null then
    delete from authz.member_permission_overrides
     where business_id = p_business_id and user_id = p_user_id and permission = p_permission;
  else
    insert into authz.member_permission_overrides (business_id, user_id, permission, allowed, updated_by)
    values (p_business_id, p_user_id, p_permission, p_allowed, auth.uid())
    on conflict (business_id, user_id, permission) do update
      set allowed = excluded.allowed, updated_by = excluded.updated_by, updated_at = now();
  end if;
end $$;

-- p_allowed null removes the override, returning the member to what their role gives them.
create function business.set_member_permission(
  p_business_id uuid, p_user_id uuid, p_permission text, p_allowed boolean
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'members.manage');
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own permissions.' using errcode = 'P0001';
  end if;
  if p_allowed and not authz.has_business_permission(p_business_id, p_permission) then
    raise exception 'You can only give out permissions you hold yourself.' using errcode = '42501';
  end if;
  perform business.apply_member_permission(p_business_id, p_user_id, p_permission, p_allowed);
end $$;

-- Internal: the former owner stays on as a manager. Demoting first satisfies the one-owner index.
create function business.move_ownership(p_business_id uuid, p_to uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from business.memberships m
                   join identity.profiles p on p.id = m.user_id
                  where m.business_id = p_business_id and m.user_id = p_to
                    and m.status = 'active' and m.role <> 'owner' and p.account_status = 'active') then
    raise exception 'Ownership can only move to an active team member.' using errcode = 'P0001';
  end if;
  update business.memberships set role = 'manager'
   where business_id = p_business_id and role = 'owner' and status = 'active';
  update business.memberships set role = 'owner'
   where business_id = p_business_id and user_id = p_to;
end $$;

create function business.transfer_ownership(p_business_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from business.memberships m
                   join business.businesses b on b.id = m.business_id
                  where m.business_id = p_business_id and m.user_id = auth.uid()
                    and m.role = 'owner' and m.status = 'active' and b.status = 'active') then
    raise exception 'Only the owner of an active business can transfer it.' using errcode = '42501';
  end if;
  perform business.move_ownership(p_business_id, p_user_id);
end $$;

-- Verida staff: a team can't manage itself when its owner has gone, or has been suspended.
create function business.admin_list_members(p_business_id uuid)
returns table (user_id uuid, full_name text, email text, role text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('businesses.manage');
  return query
    select m.user_id, p.full_name, p.email, m.role, m.created_at
      from business.memberships m
      join identity.profiles p on p.id = m.user_id
     where m.business_id = p_business_id and m.status = 'active'
     order by m.created_at;
end $$;

create function business.admin_change_member_role(p_business_id uuid, p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('businesses.manage');
  if p_role = 'owner' then
    raise exception 'Use ownership transfer to change the owner.' using errcode = '23514';
  end if;
  update business.memberships set role = p_role
   where business_id = p_business_id and user_id = p_user_id and status = 'active' and role <> 'owner';
  if not found then
    raise exception 'This member''s role cannot be changed.' using errcode = 'P0001';
  end if;
end $$;

create function business.admin_remove_member(p_business_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('businesses.manage');
  update business.memberships set status = 'removed'
   where business_id = p_business_id and user_id = p_user_id and status = 'active' and role <> 'owner';
  if not found then
    raise exception 'This member cannot be removed.' using errcode = 'P0001';
  end if;
end $$;

create function business.admin_member_permissions(p_business_id uuid, p_user_id uuid)
returns table (permission text, description text, from_role boolean, override boolean, allowed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('businesses.manage');
  return query select * from business.permissions_of(p_business_id, p_user_id);
end $$;

create function business.admin_set_member_permission(
  p_business_id uuid, p_user_id uuid, p_permission text, p_allowed boolean
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('businesses.manage');
  perform business.apply_member_permission(p_business_id, p_user_id, p_permission, p_allowed);
end $$;

create function business.admin_transfer_ownership(p_business_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('businesses.manage');
  perform business.move_ownership(p_business_id, p_user_id);
end $$;

-- FR-B13 from the Verida side. The retention period runs from here.
create function business.admin_initiate_deletion(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('businesses.manage');
  update business.businesses set status = 'deletion_requested' where id = p_id;
  if not found then
    raise exception 'This business could not be found.' using errcode = 'P0002';
  end if;
end $$;

grant execute on function business.member_permissions(uuid, uuid) to authenticated;
grant execute on function business.set_member_permission(uuid, uuid, text, boolean) to authenticated;
grant execute on function business.transfer_ownership(uuid, uuid) to authenticated;
grant execute on function business.admin_list_members(uuid) to authenticated;
grant execute on function business.admin_change_member_role(uuid, uuid, text) to authenticated;
grant execute on function business.admin_remove_member(uuid, uuid) to authenticated;
grant execute on function business.admin_member_permissions(uuid, uuid) to authenticated;
grant execute on function business.admin_set_member_permission(uuid, uuid, text, boolean) to authenticated;
grant execute on function business.admin_transfer_ownership(uuid, uuid) to authenticated;
grant execute on function business.admin_initiate_deletion(uuid) to authenticated;
-- Deliberately not granted to clients: permissions_of, apply_member_permission and move_ownership,
-- which carry no permission check of their own.
