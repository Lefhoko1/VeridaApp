-- FR-A21, FR-A27, FR-B13, section 5: deletion requests wait out a retention period, then Verida
-- staff decide. Nothing here runs by itself, because erasure can't be undone.

create table platform.retention_settings (
  singleton           boolean primary key default true check (singleton),
  deletion_grace_days int not null default 30 check (deletion_grace_days between 0 and 3650),
  updated_at          timestamptz not null default now(),
  updated_by          uuid references identity.profiles (id)
);
insert into platform.retention_settings default values;
-- No policies and no client grants: read and written only through the functions below.
alter table platform.retention_settings enable row level security;
create trigger capture_change after insert or update on platform.retention_settings
  for each row execute function audit.capture_change();

create function platform.deletion_grace_days() returns int
language sql stable security definer set search_path = '' as $$
  select deletion_grace_days from platform.retention_settings
$$;

create function platform.admin_get_retention() returns int
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('deletions.process');
  return platform.deletion_grace_days();
end $$;

create function platform.admin_set_retention(p_days int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('deletions.process');
  if p_days is null or p_days not between 0 and 3650 then
    raise exception 'The retention period must be between 0 and 3650 days.' using errcode = '23514';
  end if;
  update platform.retention_settings set deletion_grace_days = p_days, updated_at = now(), updated_by = auth.uid();
end $$;

-- Refuses while the retention period is still running.
create function platform.assert_retention_elapsed(p_requested_at timestamptz) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  erasable_from timestamptz := p_requested_at + make_interval(days => platform.deletion_grace_days());
begin
  if p_requested_at is null then
    raise exception 'Nobody has requested deletion of this.' using errcode = 'P0001';
  end if;
  if now() < erasable_from then
    raise exception 'The retention period runs until %.', to_char(erasable_from, 'YYYY-MM-DD') using errcode = 'P0001';
  end if;
end $$;

create function platform.admin_deletion_queue()
returns table (kind text, id uuid, name text, detail text, requested_at timestamptz, erasable_from timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  grace constant interval := make_interval(days => platform.deletion_grace_days());
begin
  perform authz.require_platform_permission('deletions.process');
  return query
    select 'account'::text, p.id, p.full_name, p.email, p.deletion_requested_at, p.deletion_requested_at + grace
      from identity.profiles p
     where p.account_status = 'deletion_requested'
    union all
    select 'business', b.id, b.name, b.country, b.deletion_requested_at, b.deletion_requested_at + grace
      from business.businesses b
     where b.status = 'deletion_requested'
    union all
    select 'learner_profile', lp.user_id, p.full_name, p.email, lp.deletion_requested_at, lp.deletion_requested_at + grace
      from learning.learner_profiles lp
      join identity.profiles p on p.id = lp.user_id
     where lp.status = 'deletion_requested'
    order by 5;
end $$;

-- Business records keep the row so that "who entered this" still resolves, but it no longer says
-- anything about the person. Sign-in details go with it, which also frees their email address.
create function identity.admin_erase_account(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target  identity.profiles;
  address text;
begin
  perform authz.require_platform_permission('deletions.process');
  select * into target from identity.profiles where id = p_id;
  if not found then
    raise exception 'This user could not be found.' using errcode = 'P0002';
  end if;
  if p_id = auth.uid() then
    raise exception 'You cannot erase your own account.' using errcode = 'P0001';
  end if;
  if target.account_status <> 'deletion_requested' then
    raise exception 'Only an account with a deletion request can be erased.' using errcode = 'P0001';
  end if;
  perform platform.assert_retention_elapsed(target.deletion_requested_at);
  if exists (select 1 from business.memberships where user_id = p_id and role = 'owner' and status = 'active') then
    raise exception 'This person still owns a business. Transfer it or erase it first.' using errcode = 'P0001';
  end if;

  address := 'erased-' || p_id || '@erased.verida.invalid';

  delete from business.memberships where user_id = p_id;
  delete from business.invitations where lower(email) = lower(target.email);
  delete from authz.platform_staff_overrides where user_id = p_id;
  delete from authz.platform_role_assignments where user_id = p_id;
  delete from learning.lessons where learner_id = p_id;
  delete from learning.activity_responses where learner_id = p_id;
  delete from learning.lesson_responses where learner_id = p_id;
  delete from learning.learner_profiles where user_id = p_id;
  delete from assistant.conversations where user_id = p_id;
  update assistant.request_log set user_id = null where user_id = p_id;
  update platform.system_events set user_id = null where user_id = p_id;

  delete from auth.sessions where user_id = p_id;
  delete from auth.identities where user_id = p_id;
  update auth.users
     set email = address, encrypted_password = null, phone = null, raw_user_meta_data = '{}',
         email_change = '', recovery_token = '', confirmation_token = '', banned_until = '2999-01-01'
   where id = p_id;

  update identity.profiles
     set full_name = 'Deleted user', email = address, phone = null, account_status = 'erased', updated_at = now()
   where id = p_id;

  -- Last, because the steps above can themselves raise notifications and audit entries.
  delete from notifications.notifications where user_id = p_id;
  delete from notifications.preferences where user_id = p_id;
  delete from notifications.outbox where lower(to_email) = lower(target.email);
  update audit.record_changes set old_data = null, new_data = null
   where table_schema = 'identity' and table_name = 'profiles' and record_id = p_id;
end $$;

-- All of the business's records go with it. Staff must confirm no law requires keeping them.
create function business.admin_erase_business(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target business.businesses;
  member uuid;
begin
  perform authz.require_platform_permission('deletions.process');
  select * into target from business.businesses where id = p_id;
  if not found then
    raise exception 'This business could not be found.' using errcode = 'P0002';
  end if;
  if target.status <> 'deletion_requested' then
    raise exception 'Only a business with a deletion request can be erased.' using errcode = 'P0001';
  end if;
  perform platform.assert_retention_elapsed(target.deletion_requested_at);

  for member in select user_id from business.memberships where business_id = p_id and status = 'active' loop
    perform notifications.deliver(member, 'account', 'Business deleted',
      format('%s and its records have been permanently deleted.', target.name));
  end loop;

  delete from business.businesses where id = p_id;

  -- Deleting the rows copied them into the audit log, which would defeat the purpose.
  delete from audit.record_changes where business_id = p_id;
  insert into audit.record_changes (table_schema, table_name, record_id, action, actor_id)
  values ('business', 'businesses', p_id, 'DELETE', auth.uid());
end $$;

create function learning.admin_erase_learner_profile(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target learning.learner_profiles;
begin
  perform authz.require_platform_permission('deletions.process');
  select * into target from learning.learner_profiles where user_id = p_user;
  if not found or target.status <> 'deletion_requested' then
    raise exception 'Only a learner profile with a deletion request can be erased.' using errcode = 'P0001';
  end if;
  perform platform.assert_retention_elapsed(target.deletion_requested_at);

  delete from learning.activity_responses where learner_id = p_user;
  delete from learning.lesson_responses where learner_id = p_user;
  delete from learning.learner_profiles where user_id = p_user;
  update learning.lessons set status = 'archived', updated_at = now()
   where learner_id = p_user and status in ('published', 'completed');
end $$;

create function learning.admin_restore_learner_profile(p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('deletions.process');
  update learning.learner_profiles set status = 'active', updated_at = now()
   where user_id = p_user and status = 'deletion_requested';
  if not found then
    raise exception 'This learner profile has no deletion request.' using errcode = 'P0001';
  end if;
end $$;

create function identity.admin_cancel_deletion(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('deletions.process');
  update identity.profiles set account_status = 'active', updated_at = now()
   where id = p_id and account_status = 'deletion_requested';
  if not found then
    raise exception 'This account has no deletion request.' using errcode = 'P0001';
  end if;
end $$;

create function business.admin_cancel_deletion(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('deletions.process');
  update business.businesses set status = 'active' where id = p_id and status = 'deletion_requested';
  if not found then
    raise exception 'This business has no deletion request.' using errcode = 'P0001';
  end if;
end $$;

grant execute on function platform.admin_get_retention() to authenticated;
grant execute on function platform.admin_set_retention(int) to authenticated;
grant execute on function platform.admin_deletion_queue() to authenticated;
grant execute on function identity.admin_erase_account(uuid) to authenticated;
grant execute on function identity.admin_cancel_deletion(uuid) to authenticated;
grant execute on function business.admin_erase_business(uuid) to authenticated;
grant execute on function business.admin_cancel_deletion(uuid) to authenticated;
grant execute on function learning.admin_erase_learner_profile(uuid) to authenticated;
grant execute on function learning.admin_restore_learner_profile(uuid) to authenticated;
-- Deliberately not granted to clients: deletion_grace_days and assert_retention_elapsed.
