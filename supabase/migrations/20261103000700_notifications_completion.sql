-- Module H: email delivery through an outbox, learning reminders, and account-status messages.

-- FR-H08: email can be turned off for the optional message types.
alter table notifications.preferences add column email_enabled boolean not null default true;

-- Emails wait here until the dispatch service sends them, so a failed send is retried and
-- recorded rather than lost. No client can read or write this table.
create table notifications.outbox (
  id           uuid primary key default gen_random_uuid(),
  delivery_id  uuid references notifications.deliveries (id) on delete set null,
  to_email     text not null,
  subject      text not null,
  body         text not null,
  status       text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts     int  not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  claimed_at   timestamptz,
  sent_at      timestamptz
);
create index outbox_pending_idx on notifications.outbox (created_at) where status in ('pending', 'sending');
alter table notifications.outbox enable row level security;

create function notifications.enqueue_email(p_to text, p_subject text, p_body text, p_delivery uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into notifications.outbox (delivery_id, to_email, subject, body)
  values (p_delivery, p_to, p_subject, p_body);
end $$;

-- Replaces the original: the same in-app delivery, now followed by an email.
create or replace function notifications.deliver(
  p_user_id uuid, p_type text, p_title text, p_body text, p_data jsonb default '{}'
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  created  uuid;
  delivery uuid;
  address  text;
  prefs    notifications.preferences;
begin
  select * into prefs from notifications.preferences where user_id = p_user_id;
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

  -- Account and invitation messages are always emailed; the rest respect the preference.
  if p_type in ('account', 'invitation') or prefs.email_enabled is not false then
    select email into address from identity.profiles where id = p_user_id;
    if address is not null then
      insert into notifications.deliveries (notification_id, channel, status)
      values (created, 'email', 'pending')
      returning id into delivery;
      perform notifications.enqueue_email(address, p_title, p_body, delivery);
    end if;
  end if;
end $$;

-- FR-H02, replacing the original: someone with no account yet is invited by email.
create or replace function notifications.on_invitation_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  invitee uuid;
  biz     text;
  message text;
begin
  select name into biz from business.businesses where id = new.business_id;
  message := format('You have been invited to join %s on Verida.', biz);
  select id into invitee from identity.profiles where lower(email) = lower(new.email);
  if invitee is not null then
    perform notifications.deliver(invitee, 'invitation', 'You have been invited', message,
      jsonb_build_object('invitation_id', new.id, 'business_id', new.business_id));
  else
    perform notifications.enqueue_email(new.email, 'You have been invited to Verida',
      message || ' Create an account with this email address to accept.');
  end if;
  return new;
end $$;

-- FR-H05, FR-A26: tells a person when an administrator changes their account.
create function notifications.on_profile_status_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.account_status is distinct from old.account_status
     and old.account_status <> 'pending_verification' then
    perform notifications.deliver(new.id, 'account', 'Your account status changed',
      format('Your Verida account is now %s.', replace(new.account_status, '_', ' ')));
  end if;
  return new;
end $$;

create trigger notify_profile_status_changed after update of account_status on identity.profiles
  for each row execute function notifications.on_profile_status_changed();

-- FR-H04: nudges learners about a published lesson they have left unfinished. Run on a schedule.
create function notifications.send_learning_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  lesson record;
  sent   int := 0;
begin
  for lesson in
    select l.id, l.learner_id, l.title
      from learning.lessons l
     where l.status = 'published' and l.published_at < now() - interval '3 days'
       and not exists (select 1 from notifications.notifications n
                        where n.user_id = l.learner_id and n.type = 'reminder'
                          and n.data ->> 'lesson_id' = l.id::text
                          and n.created_at > now() - interval '7 days')
  loop
    perform notifications.deliver(lesson.learner_id, 'reminder', 'Your lesson is waiting',
      format('Finish "%s" when you have a few minutes.', lesson.title),
      jsonb_build_object('lesson_id', lesson.id));
    sent := sent + 1;
  end loop;
  return sent;
end $$;

-- Hands a batch to the dispatch service. A send that never reported back is retried.
create function notifications.claim_outbox(p_limit int default 20)
returns table (id uuid, to_email text, subject text, body text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
    update notifications.outbox o
       set status = 'sending', attempts = o.attempts + 1, claimed_at = now()
     where o.id in (
       select c.id from notifications.outbox c
        where c.attempts < 5
          and (c.status = 'pending' or (c.status = 'sending' and c.claimed_at < now() - interval '15 minutes'))
        order by c.created_at
        limit greatest(p_limit, 1)
        for update skip locked)
    returning o.id, o.to_email, o.subject, o.body;
end $$;

-- FR-H09: records what happened to each email.
create function notifications.complete_outbox(p_id uuid, p_sent boolean, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  entry notifications.outbox;
begin
  update notifications.outbox o
     set status = case when p_sent then 'sent' when o.attempts >= 5 then 'failed' else 'pending' end,
         sent_at = case when p_sent then now() end,
         last_error = left(p_error, 500)
   where o.id = p_id
  returning o.* into entry;

  if entry.delivery_id is not null and entry.status in ('sent', 'failed') then
    update notifications.deliveries
       set status = case when entry.status = 'sent' then 'delivered' else 'failed' end,
           detail = entry.last_error
     where id = entry.delivery_id;
  end if;
end $$;

-- None of the functions in this file is granted to clients: they run from triggers,
-- the schedule, or the dispatch service using the service role.
