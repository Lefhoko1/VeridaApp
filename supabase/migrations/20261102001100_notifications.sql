-- Module H: notifications. Runs last on purpose: it subscribes to events in other modules,
-- so those modules never need to know that notifications exist.

create table notifications.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references identity.profiles (id) on delete cascade,
  type       text not null check (type in ('account', 'invitation', 'lesson', 'reminder', 'business')),
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications.notifications (user_id, created_at desc);

create table notifications.preferences (
  user_id          uuid primary key references identity.profiles (id) on delete cascade,
  lesson_published boolean not null default true,
  learning_reminders boolean not null default true,
  business_updates boolean not null default true,
  updated_at       timestamptz not null default now()
);

-- FR-H09.
create table notifications.deliveries (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications.notifications (id) on delete cascade,
  channel         text not null check (channel in ('in_app', 'email')),
  status          text not null check (status in ('pending', 'delivered', 'failed')),
  detail          text,
  created_at      timestamptz not null default now()
);

alter table notifications.notifications enable row level security;
alter table notifications.preferences enable row level security;
alter table notifications.deliveries enable row level security;

create policy notifications_read on notifications.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_mark_read on notifications.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy notifications_delete on notifications.notifications for delete to authenticated
  using (user_id = (select auth.uid()));
create policy preferences_own on notifications.preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, delete on notifications.notifications to authenticated;
grant update (read_at) on notifications.notifications to authenticated;
grant select, insert, update on notifications.preferences to authenticated;

create function notifications.deliver(
  p_user_id uuid, p_type text, p_title text, p_body text, p_data jsonb default '{}'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  created uuid;
  prefs   notifications.preferences;
begin
  select * into prefs from notifications.preferences where user_id = p_user_id;
  -- FR-H08: account and invitation messages are not optional; the others respect preferences.
  if (p_type = 'lesson' and prefs.lesson_published is false)
     or (p_type = 'reminder' and prefs.learning_reminders is false)
     or (p_type = 'business' and prefs.business_updates is false) then
    return;
  end if;

  insert into notifications.notifications (user_id, type, title, body, data)
  values (p_user_id, p_type, p_title, p_body, p_data)
  returning id into created;

  insert into notifications.deliveries (notification_id, channel, status)
  values (created, 'in_app', 'delivered');
end $$;

-- FR-H01.
create function notifications.on_profile_activated() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.account_status = 'active' and (tg_op = 'INSERT' or old.account_status = 'pending_verification') then
    perform notifications.deliver(new.id, 'account', 'Welcome to Verida',
      'Your account is ready. Set up your business to get started.');
  end if;
  return new;
end $$;

create trigger notify_profile_activated after insert or update of account_status on identity.profiles
  for each row execute function notifications.on_profile_activated();

-- FR-H02.
create function notifications.on_invitation_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  invitee uuid;
  biz     text;
begin
  select id into invitee from identity.profiles where lower(email) = lower(new.email);
  if invitee is not null then
    select name into biz from business.businesses where id = new.business_id;
    perform notifications.deliver(invitee, 'invitation', 'You have been invited',
      format('You have been invited to join %s.', biz),
      jsonb_build_object('invitation_id', new.id, 'business_id', new.business_id));
  end if;
  return new;
end $$;

create trigger notify_invitation_created after insert on business.invitations
  for each row execute function notifications.on_invitation_created();

-- FR-H05.
create function notifications.on_business_status_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  member uuid;
begin
  if new.status is distinct from old.status then
    for member in select user_id from business.memberships
                   where business_id = new.id and status = 'active' and role in ('owner', 'manager')
    loop
      perform notifications.deliver(member, 'business', 'Business status changed',
        format('%s is now %s.', new.name, replace(new.status, '_', ' ')),
        jsonb_build_object('business_id', new.id));
    end loop;
  end if;
  return new;
end $$;

create trigger notify_business_status after update of status on business.businesses
  for each row execute function notifications.on_business_status_changed();

-- FR-F32, FR-H03.
create function notifications.on_lesson_published() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    perform notifications.deliver(new.learner_id, 'lesson', 'Your weekly lesson is ready',
      new.title, jsonb_build_object('lesson_id', new.id));
  end if;
  return new;
end $$;

create trigger notify_lesson_published after update of status on learning.lessons
  for each row execute function notifications.on_lesson_published();
