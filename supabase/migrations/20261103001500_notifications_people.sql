-- FR-H05: people hear about changes to their own access, on both sides of the platform, and Verida
-- staff hear about work waiting for them. Runs after the modules it subscribes to, as before.

alter table notifications.notifications drop constraint notifications_type_check;
alter table notifications.notifications
  add constraint notifications_type_check
  check (type in ('account', 'invitation', 'lesson', 'reminder', 'business', 'platform'));

-- Replaces the original: an erased account has nobody left to tell.
create or replace function notifications.on_profile_status_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.account_status is distinct from old.account_status
     and old.account_status <> 'pending_verification'
     and new.account_status <> 'erased' then
    perform notifications.deliver(new.id, 'account', 'Your account status changed',
      format('Your Verida account is now %s.', replace(new.account_status, '_', ' ')));
  end if;
  return new;
end $$;

create function notifications.tell_staff(p_permission text, p_title text, p_body text, p_data jsonb default '{}') returns void
language plpgsql security definer set search_path = '' as $$
declare
  person uuid;
begin
  for person in select * from authz.staff_with_permission(p_permission) loop
    perform notifications.deliver(person, 'platform', p_title, p_body, p_data);
  end loop;
end $$;

-- One switch flipped several times should reach the person's inbox once.
create function notifications.recently_told(p_user uuid, p_title text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from notifications.notifications
                  where user_id = p_user and title = p_title and created_at > now() - interval '10 minutes')
$$;

-- FR-B22, FR-B23.
create function notifications.on_membership_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  biz text;
begin
  select name into biz from business.businesses where id = new.business_id;
  if old.status = 'active' and new.status = 'removed' then
    perform notifications.deliver(new.user_id, 'account', 'You were removed from a business',
      format('You no longer have access to %s.', biz), jsonb_build_object('business_id', new.business_id));
  elsif old.status = 'active' and new.status = 'active' and new.role is distinct from old.role then
    perform notifications.deliver(new.user_id, 'account', 'Your role changed',
      format('You are now %s in %s.', new.role, biz), jsonb_build_object('business_id', new.business_id));
  end if;
  return new;
end $$;

create trigger notify_membership_changed after update of role, status on business.memberships
  for each row execute function notifications.on_membership_changed();

-- A depth above one means a role change cleared these, and that has its own message.
create function notifications.on_member_permission_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  member uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  target uuid := case when tg_op = 'DELETE' then old.business_id else new.business_id end;
  biz    text;
begin
  if pg_trigger_depth() = 1 and not notifications.recently_told(member, 'Your permissions changed') then
    select name into biz from business.businesses where id = target;
    perform notifications.deliver(member, 'account', 'Your permissions changed',
      format('What you can do in %s has changed.', biz), jsonb_build_object('business_id', target));
  end if;
  return null;
end $$;

create trigger notify_member_permission_changed after insert or update or delete on authz.member_permission_overrides
  for each row execute function notifications.on_member_permission_changed();

-- FR-I12: the same for Verida staff.
create function notifications.on_platform_role_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Erasing an account removes its roles, and there is nobody left to tell.
  if tg_op = 'INSERT' then
    perform notifications.deliver(new.user_id, 'account', 'You have a new Verida role',
      format('You are now a Verida %s.', replace(new.role, '_', ' ')));
  elsif exists (select 1 from identity.profiles where id = old.user_id and account_status = 'active') then
    perform notifications.deliver(old.user_id, 'account', 'Your Verida role was removed',
      format('You are no longer a Verida %s.', replace(old.role, '_', ' ')));
  end if;
  return null;
end $$;

create trigger notify_platform_role_changed after insert or delete on authz.platform_role_assignments
  for each row execute function notifications.on_platform_role_changed();

create function notifications.on_staff_permission_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  person uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
begin
  if exists (select 1 from identity.profiles where id = person and account_status = 'active')
     and not notifications.recently_told(person, 'Your Verida permissions changed') then
    perform notifications.deliver(person, 'account', 'Your Verida permissions changed',
      'What you can do on the Verida platform has changed.');
  end if;
  return null;
end $$;

create trigger notify_staff_permission_changed after insert or update or delete on authz.platform_staff_overrides
  for each row execute function notifications.on_staff_permission_changed();

-- Work waiting for staff: deletion requests.
create function notifications.on_account_deletion_requested() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.account_status = 'deletion_requested' and old.account_status <> 'deletion_requested' then
    perform notifications.tell_staff('deletions.process', 'Account deletion requested',
      'An account is waiting in the deletion queue.', jsonb_build_object('kind', 'account', 'id', new.id));
  end if;
  return new;
end $$;

create trigger notify_account_deletion_requested after update of account_status on identity.profiles
  for each row execute function notifications.on_account_deletion_requested();

create function notifications.on_business_deletion_requested() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'deletion_requested' and old.status <> 'deletion_requested' then
    perform notifications.tell_staff('deletions.process', 'Business deletion requested',
      'A business is waiting in the deletion queue.', jsonb_build_object('kind', 'business', 'id', new.id));
  end if;
  return new;
end $$;

create trigger notify_business_deletion_requested after update of status on business.businesses
  for each row execute function notifications.on_business_deletion_requested();

create function notifications.on_learner_deletion_requested() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'deletion_requested' and (tg_op = 'INSERT' or old.status <> 'deletion_requested') then
    perform notifications.tell_staff('deletions.process', 'Learner profile deletion requested',
      'A learner profile is waiting in the deletion queue.', jsonb_build_object('kind', 'learner_profile', 'id', new.user_id));
  end if;
  return new;
end $$;

create trigger notify_learner_deletion_requested after insert or update of status on learning.learner_profiles
  for each row execute function notifications.on_learner_deletion_requested();

-- Work waiting for staff: lessons to review.
create function notifications.on_lesson_awaiting_review() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'pending_review' then
    perform notifications.tell_staff('lessons.review', 'A lesson is waiting for review', new.title,
      jsonb_build_object('lesson_id', new.id));
  end if;
  return new;
end $$;

create trigger notify_lesson_awaiting_review after insert on learning.lessons
  for each row execute function notifications.on_lesson_awaiting_review();

-- FR-I10: staff hear about errors without having to open the screen. Any signed-in client can
-- report an event, so a hard limit of one alert an hour stops this being used to flood inboxes.
create function notifications.on_system_error() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.severity = 'error'
     and not exists (select 1 from notifications.notifications
                      where type = 'platform' and data ->> 'alert' = 'system_error'
                        and created_at > now() - interval '1 hour') then
    perform notifications.tell_staff('monitoring.view', 'Verida is reporting errors',
      'Open Monitoring to see the latest errors.', jsonb_build_object('alert', 'system_error'));
  end if;
  return new;
end $$;

create trigger notify_system_error after insert on platform.system_events
  for each row execute function notifications.on_system_error();
