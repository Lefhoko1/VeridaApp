-- FR-A20, FR-A21, FR-A27: leaving Verida is subject to ownership rules, and is timed so that the
-- retention period can be measured. Erasure itself is in the retention migration.

alter table identity.profiles drop constraint profiles_account_status_check;
alter table identity.profiles
  add constraint profiles_account_status_check
  check (account_status in ('pending_verification', 'active', 'suspended',
                            'deactivated', 'deletion_requested', 'erased'));

alter table identity.profiles add column deletion_requested_at timestamptz;
update identity.profiles set deletion_requested_at = updated_at where account_status = 'deletion_requested';

create function identity.stamp_deletion_request() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.account_status = 'deletion_requested' then
    new.deletion_requested_at := coalesce(old.deletion_requested_at, now());
  else
    new.deletion_requested_at := null;
  end if;
  return new;
end $$;

create trigger stamp_deletion_request before update of account_status on identity.profiles
  for each row execute function identity.stamp_deletion_request();

-- Nobody may leave a running business without an owner, or Verida without an administrator.
create function identity.assert_can_leave(p_user uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  owned text;
begin
  select string_agg(b.name, ', ' order by b.name) into owned
    from business.memberships m
    join business.businesses b on b.id = m.business_id
   where m.user_id = p_user and m.role = 'owner' and m.status = 'active'
     and b.status in ('active', 'suspended');
  if owned is not null then
    raise exception 'This account still owns %. Transfer ownership or deactivate the business first.', owned
      using errcode = 'P0001';
  end if;
  if exists (select 1 from authz.platform_role_assignments where user_id = p_user and role = 'administrator')
     and authz.other_active_administrators(p_user) = 0 then
    raise exception 'This account is the only Verida administrator. Assign another administrator first.'
      using errcode = 'P0001';
  end if;
end $$;

create or replace function identity.deactivate_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform identity.assert_can_leave(auth.uid());
  update identity.profiles set account_status = 'deactivated', updated_at = now()
   where id = auth.uid() and account_status = 'active';
  if not found then
    raise exception 'Only an active account can be deactivated.' using errcode = 'P0001';
  end if;
end $$;

-- A suspended account can't use this to replace its suspension with another status.
create or replace function identity.request_account_deletion() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform identity.assert_can_leave(auth.uid());
  update identity.profiles set account_status = 'deletion_requested', updated_at = now()
   where id = auth.uid() and account_status in ('active', 'deactivated');
  if not found then
    raise exception 'This account cannot request deletion. Contact Verida support.' using errcode = 'P0001';
  end if;
end $$;

-- Staff who are not administrators can't act against an administrator.
create function identity.assert_may_act_on(p_id uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if exists (select 1 from authz.platform_role_assignments where user_id = p_id and role = 'administrator')
     and not authz.has_platform_role('administrator') then
    raise exception 'Only an administrator can change an administrator''s account.' using errcode = '42501';
  end if;
end $$;

create or replace function identity.admin_update_user(p_id uuid, p_full_name text, p_phone text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('users.manage');
  perform identity.assert_may_act_on(p_id);
  update identity.profiles set full_name = trim(p_full_name), phone = p_phone, updated_at = now()
   where id = p_id and account_status <> 'erased';
  if not found then
    raise exception 'This user could not be found.' using errcode = 'P0002';
  end if;
end $$;

create or replace function identity.admin_set_user_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('users.manage');
  if p_status not in ('active', 'suspended') then
    raise exception 'An account can only be suspended or reactivated here.' using errcode = '23514';
  end if;
  if p_id = auth.uid() then
    raise exception 'You cannot change the status of your own account.' using errcode = 'P0001';
  end if;
  perform identity.assert_may_act_on(p_id);
  update identity.profiles set account_status = p_status, updated_at = now()
   where id = p_id and account_status <> 'erased';
  if not found then
    raise exception 'This user could not be found.' using errcode = 'P0002';
  end if;
end $$;

create or replace function identity.admin_initiate_deletion(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('users.manage');
  if p_id = auth.uid() then
    raise exception 'You cannot delete your own account here.' using errcode = 'P0001';
  end if;
  perform identity.assert_may_act_on(p_id);
  perform identity.assert_can_leave(p_id);
  update identity.profiles set account_status = 'deletion_requested', updated_at = now()
   where id = p_id and account_status <> 'erased';
  if not found then
    raise exception 'This user could not be found.' using errcode = 'P0002';
  end if;
end $$;
