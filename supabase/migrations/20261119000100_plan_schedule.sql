-- Plan Module Developer Specification v1.0, P1 (Schedule & collaboration): events, repeating
-- tasks, reminders, comments, task history and weekly reviews. Plan still never changes a
-- business record or a measure.

------------------------------------------------------------------------------------------------
-- Tasks: the business-local completion day (for reviews), concurrency checks and a link to the
-- series a task was generated from (section 6.1: each occurrence keeps its rule and a unique key).

alter table plan.tasks
  add column completed_on  date,
  add column rule_id       uuid,
  add column occurrence_on date,
  -- An occurrence someone changed on its own, so later changes to the series leave it alone.
  add column detached      boolean not null default false;

-- Existing completed tasks get their local completion day. Triggers are off so that this
-- backfill neither raises versions nor fills the audit log.
alter table plan.tasks disable trigger user;
update plan.tasks t
   set completed_on = (t.completed_at at time zone b.time_zone)::date
  from business.businesses b
 where b.id = t.business_id and t.completed_at is not null;
alter table plan.tasks enable trigger user;

------------------------------------------------------------------------------------------------
-- Replaces the P0 version, which worked out the completion day itself; it is now stored.
create or replace function plan.overview(p_business_id uuid, p_from date, p_to date)
returns table (
  today date, open_tasks int, overdue_tasks int, blocked_tasks int, due_today int,
  completed_in_period int, active_goals int, eligible_due int,
  completion_rate numeric, on_time_rate numeric
)
language plpgsql stable set search_path = '' as $$
declare
  zone text;
  local_today date;
begin
  perform authz.require_business_permission(p_business_id, 'plan.view');
  if p_from > p_to then
    raise exception 'The period start must be before its end.' using errcode = '22023';
  end if;
  select b.time_zone into zone from business.businesses b where b.id = p_business_id;
  local_today := (now() at time zone zone)::date;

  return query
    with t as (
      select k.* from plan.tasks k where k.business_id = p_business_id
    ),
    due as (
      select count(*) filter (where t.status <> 'cancelled') as eligible,
             count(*) filter (where t.status = 'completed') as done
        from t where t.due_on between p_from and p_to
    ),
    finished as (
      select count(*) filter (where t.due_on is not null) as with_due,
             count(*) filter (where t.due_on is not null and t.completed_on <= t.due_on) as on_time,
             count(*) as total
        from t where t.status = 'completed' and t.completed_on between p_from and p_to
    )
    select local_today,
           (select count(*)::int from t where t.status in ('not_started', 'in_progress', 'blocked')),
           (select count(*)::int from t where t.status in ('not_started', 'in_progress', 'blocked') and t.due_on < local_today),
           (select count(*)::int from t where t.status = 'blocked'),
           (select count(*)::int from t where t.status in ('not_started', 'in_progress', 'blocked') and t.due_on = local_today),
           (select f.total::int from finished f),
           (select count(*)::int from plan.goals g where g.business_id = p_business_id and g.status in ('active', 'at_risk')),
           (select d.eligible::int from due d),
           (select case when d.eligible = 0 then null else round(d.done * 100.0 / d.eligible, 1) end from due d),
           (select case when f.with_due = 0 then null else round(f.on_time * 100.0 / f.with_due, 1) end from finished f);
end $$;

------------------------------------------------------------------------------------------------
-- Section 4.4 and entity RECURRING_RULE: a series that produces one task per occurrence.

create table plan.recurring_rules (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references business.businesses (id) on delete cascade,
  -- What each occurrence looks like.
  title          text not null check (length(trim(title)) between 1 and 160),
  description    text check (char_length(description) <= 2000),
  priority       text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  assigned_to    uuid references identity.profiles (id),
  -- When it repeats. Fixed once created: a different pattern is a new series.
  frequency      text not null check (frequency in ('daily', 'weekly', 'monthly')),
  interval_count int not null default 1 check (interval_count between 1 and 52),
  -- ISO weekdays, 1 = Monday to 7 = Sunday.
  days_of_week   int[] check (days_of_week is null or days_of_week <@ array[1, 2, 3, 4, 5, 6, 7]),
  -- A short month uses its last day.
  day_of_month   int check (day_of_month between 1 and 31),
  starts_on      date not null,
  ends_on        date,
  -- Occurrences before the series was created are never generated, so a back-dated series
  -- does not fill the list with overdue work.
  generate_from  date not null,
  status         text not null default 'active' check (status in ('active', 'ended')),
  version        int not null default 1,
  created_at     timestamptz not null default now(),
  created_by     uuid references identity.profiles (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references identity.profiles (id),
  unique (id, business_id),
  check (ends_on is null or ends_on >= starts_on),
  check (frequency <> 'weekly' or coalesce(cardinality(days_of_week), 0) > 0),
  check (frequency <> 'monthly' or day_of_month is not null)
);
create index recurring_rules_business_idx on plan.recurring_rules (business_id, status);

alter table plan.tasks
  add constraint tasks_rule_fk foreign key (rule_id, business_id) references plan.recurring_rules (id, business_id) on delete cascade,
  add constraint tasks_occurrence_unique unique (rule_id, occurrence_on),
  add constraint tasks_occurrence_pair check ((rule_id is null) = (occurrence_on is null));
create index tasks_business_completed_idx on plan.tasks (business_id, completed_on) where completed_on is not null;

-- The dates a series falls on between two days, inclusive.
create function plan.rule_dates(p_rule plan.recurring_rules, p_from date, p_to date) returns setof date
language plpgsql stable set search_path = '' as $$
declare
  lo date := greatest(p_from, p_rule.starts_on);
  hi date := least(p_to, coalesce(p_rule.ends_on, p_to));
begin
  if lo > hi then
    return;
  end if;
  if p_rule.frequency = 'daily' then
    return query
      select g::date from generate_series(lo, hi, interval '1 day') g
       where (g::date - p_rule.starts_on) % p_rule.interval_count = 0;
  elsif p_rule.frequency = 'weekly' then
    return query
      select g::date from generate_series(lo, hi, interval '1 day') g
       where extract(isodow from g)::int = any (p_rule.days_of_week)
         and ((date_trunc('week', g)::date - date_trunc('week', p_rule.starts_on)::date) / 7) % p_rule.interval_count = 0;
  else
    return query
      select s.on_date from (
        select (date_trunc('month', m)::date
                + (least(p_rule.day_of_month,
                         extract(day from date_trunc('month', m) + interval '1 month - 1 day')::int) - 1)) as on_date,
               ((extract(year from m) * 12 + extract(month from m))
                - (extract(year from p_rule.starts_on) * 12 + extract(month from p_rule.starts_on)))::int as month_index
          from generate_series(date_trunc('month', p_rule.starts_on), date_trunc('month', hi), interval '1 month') m
      ) s
       where s.on_date between lo and hi and s.month_index % p_rule.interval_count = 0;
  end if;
end $$;

grant execute on function plan.rule_dates(plan.recurring_rules, date, date) to authenticated;

-- How far ahead occurrences become real tasks. Later ones appear on the schedule as projected.
create function plan.generation_horizon(p_business_id uuid) returns date
language sql stable security definer set search_path = '' as $$
  select plan.business_today(p_business_id) + 7;
$$;

-- Section 6.2: generating twice never duplicates, because each occurrence has a unique key.
-- Internal: callers go through plan.generate_occurrences or the scheduled job.
create function plan.materialise_occurrences(p_business_id uuid, p_rule_id uuid default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  created int;
begin
  insert into plan.tasks (business_id, title, description, priority, assigned_to, due_on, rule_id, occurrence_on)
  select r.business_id, r.title, r.description, r.priority,
         -- Someone who has left the business is not given new work.
         case when exists (select 1 from business.memberships m
                            where m.business_id = r.business_id and m.user_id = r.assigned_to and m.status = 'active')
              then r.assigned_to end,
         d, r.id, d
    from plan.recurring_rules r
   cross join lateral plan.rule_dates(r, r.generate_from, plan.generation_horizon(r.business_id)) d
   where r.business_id = p_business_id
     and r.status = 'active'
     and (p_rule_id is null or r.id = p_rule_id)
  on conflict (rule_id, occurrence_on) do nothing;
  get diagnostics created = row_count;
  return created;
end $$;

create function plan.generate_occurrences(p_business_id uuid) returns int
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'plan.view');
  return plan.materialise_occurrences(p_business_id);
end $$;
grant execute on function plan.generate_occurrences(uuid) to authenticated;

-- For the scheduled job: every business with an active series.
create function plan.generate_all_occurrences() returns int
language plpgsql security definer set search_path = '' as $$
declare
  biz uuid;
  total int := 0;
begin
  for biz in select distinct business_id from plan.recurring_rules where status = 'active' loop
    total := total + plan.materialise_occurrences(biz);
  end loop;
  return total;
end $$;

create function plan.validate_rule() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.title := trim(new.title);
  new.description := nullif(trim(new.description), '');
  if new.days_of_week is not null then
    new.days_of_week := array(select distinct d from unnest(new.days_of_week) d order by d);
  end if;
  if tg_op = 'INSERT' then
    new.generate_from := greatest(new.starts_on, plan.business_today(new.business_id));
  else
    new.generate_from := old.generate_from;
    new.version := old.version + 1;
  end if;
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not exists (select 1 from business.memberships m
                      where m.business_id = new.business_id and m.user_id = new.assigned_to and m.status = 'active') then
    raise exception 'A task can only be assigned to a member of this business.' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger validate_rule before insert or update on plan.recurring_rules
  for each row execute function plan.validate_rule();

-- Section 4.4: editing the series changes the occurrences still to come that nobody has
-- touched; past ones and ones edited on their own keep their history. Ending a series cancels
-- what it had already put on the list for later.
create function plan.apply_rule_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  local_today date := plan.business_today(new.business_id);
begin
  if tg_op = 'INSERT' then
    perform plan.materialise_occurrences(new.business_id, new.id);
    return new;
  end if;

  perform set_config('plan.series_update', 'on', true);
  if new.status = 'ended' or new.ends_on is distinct from old.ends_on then
    update plan.tasks t set status = 'cancelled'
     where t.rule_id = new.id and t.status = 'not_started' and not t.detached
       and (t.occurrence_on > local_today and new.status = 'ended'
            or t.occurrence_on > new.ends_on);
  end if;
  update plan.tasks t
     set title = new.title, description = new.description, priority = new.priority, assigned_to = new.assigned_to
   where t.rule_id = new.id and t.status = 'not_started' and not t.detached and t.occurrence_on >= local_today
     and (t.title, t.description, t.priority, t.assigned_to)
         is distinct from (new.title, new.description, new.priority, new.assigned_to);
  perform set_config('plan.series_update', 'off', true);

  if new.status = 'active' then
    perform plan.materialise_occurrences(new.business_id, new.id);
  end if;
  return new;
end $$;

create trigger apply_rule_change after insert or update on plan.recurring_rules
  for each row execute function plan.apply_rule_change();

-- Replaces the P0 version: also keeps the local completion day and notes when an occurrence
-- is changed on its own.
create or replace function plan.validate_task() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  zone text;
begin
  new.title := trim(new.title);
  new.description := nullif(trim(new.description), '');
  new.completion_note := nullif(trim(new.completion_note), '');
  new.blocker_reason := nullif(trim(new.blocker_reason), '');

  if new.status = 'blocked' and new.blocker_reason is null then
    raise exception 'Say what is blocking the task.' using errcode = '23514';
  end if;
  if new.status <> 'blocked' then
    new.blocker_reason := null;
  end if;

  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then
    select b.time_zone into zone from business.businesses b where b.id = new.business_id;
    new.completed_at := now();
    new.completed_on := (now() at time zone zone)::date;
  elsif new.status <> 'completed' then
    new.completed_at := null;
    new.completed_on := null;
    new.completion_note := null;
  end if;

  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not exists (select 1 from business.memberships m
                      where m.business_id = new.business_id and m.user_id = new.assigned_to and m.status = 'active') then
    raise exception 'A task can only be assigned to a member of this business.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.rule_id := old.rule_id;
    new.occurrence_on := old.occurrence_on;
    if old.rule_id is not null
       and coalesce(current_setting('plan.series_update', true), 'off') <> 'on'
       and (new.title, new.description, new.priority, new.assigned_to, new.due_on)
           is distinct from (old.title, old.description, old.priority, old.assigned_to, old.due_on) then
      new.detached := true;
    end if;
  end if;
  return new;
end $$;

------------------------------------------------------------------------------------------------
-- Entity PLAN_EVENT: a time-bound commitment on the schedule, in the business's own time zone.

create table plan.events (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references business.businesses (id) on delete cascade,
  title         text not null check (length(trim(title)) between 1 and 160),
  description   text check (char_length(description) <= 2000),
  event_type    text not null default 'other'
                check (event_type in ('meeting', 'delivery', 'appointment', 'deadline', 'other')),
  -- A business day and optional local times, so no time zone can move it (as for tasks).
  starts_on     date not null,
  start_time    time,
  end_time      time,
  status        text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  version       int not null default 1,
  client_id     uuid unique,
  created_at    timestamptz not null default now(),
  created_by    uuid references identity.profiles (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references identity.profiles (id),
  check (end_time is null or (start_time is not null and end_time > start_time))
);
create index events_business_day_idx on plan.events (business_id, starts_on);

create function plan.validate_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.title := trim(new.title);
  new.description := nullif(trim(new.description), '');
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
  end if;
  return new;
end $$;

create trigger validate_event before insert or update on plan.events
  for each row execute function plan.validate_event();

------------------------------------------------------------------------------------------------
-- Section 4.4: one call for a date range, giving tasks, events and the occurrences a series
-- will produce later. A projected occurrence appears only where no task exists for it yet, so
-- nothing is shown twice.

create function plan.schedule(p_business_id uuid, p_from date, p_to date)
returns table (
  kind text, id uuid, rule_id uuid, title text, on_date date, start_time time, end_time time,
  status text, priority text, assigned_to uuid, event_type text
)
language plpgsql stable set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'plan.view');
  if p_from > p_to then
    raise exception 'The period start must be before its end.' using errcode = '22023';
  end if;
  if p_to - p_from > 62 then
    raise exception 'Choose a period of two months or less.' using errcode = '22023';
  end if;

  return query
    select 'task'::text, t.id, t.rule_id, t.title, t.due_on, null::time, null::time,
           t.status, t.priority, t.assigned_to, null::text
      from plan.tasks t
     where t.business_id = p_business_id and t.due_on between p_from and p_to
    union all
    select 'event', e.id, null, e.title, e.starts_on, e.start_time, e.end_time,
           e.status, null, null, e.event_type
      from plan.events e
     where e.business_id = p_business_id and e.starts_on between p_from and p_to
    union all
    select 'projected', null, r.id, r.title, d, null, null,
           'not_started', r.priority, r.assigned_to, null
      from plan.recurring_rules r
     cross join lateral plan.rule_dates(r, greatest(p_from, r.generate_from), p_to) d
     where r.business_id = p_business_id and r.status = 'active'
       and not exists (select 1 from plan.tasks t where t.rule_id = r.id and t.occurrence_on = d)
     order by 5, 6 nulls first, 4;
end $$;
grant execute on function plan.schedule(uuid, date, date) to authenticated;

------------------------------------------------------------------------------------------------
-- Section 9 and entity TASK_REMINDER. Each person sets their own reminders. Snoozing or
-- dismissing one never changes the task's due date.

alter table notifications.notifications drop constraint notifications_type_check;
alter table notifications.notifications
  add constraint notifications_type_check
  check (type in ('account', 'invitation', 'lesson', 'reminder', 'business', 'platform', 'task'));

alter table notifications.preferences
  add column task_reminders boolean not null default true,
  -- Quiet hours, read in the business's time zone. A reminder due inside them waits until they end.
  add column quiet_start time,
  add column quiet_end time,
  add constraint preferences_quiet_hours check ((quiet_start is null) = (quiet_end is null) and (quiet_start is null or quiet_start <> quiet_end));

-- Replaces the version in 20261103000700, adding task reminders to the optional messages.
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
     or (p_type = 'business' and prefs.business_updates is false)
     or (p_type = 'task' and prefs.task_reminders is false) then
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

create table plan.task_reminders (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  task_id     uuid not null,
  user_id     uuid not null references identity.profiles (id) on delete cascade,
  remind_at   timestamptz not null,
  -- skipped: the person has turned task reminders off. cancelled: the task closed first.
  status      text not null default 'pending' check (status in ('pending', 'sent', 'dismissed', 'skipped', 'cancelled')),
  sent_at     timestamptz,
  created_at  timestamptz not null default now(),
  foreign key (task_id, business_id) references plan.tasks (id, business_id) on delete cascade,
  -- Section 9: the same reminder twice, for example after an offline retry, is one reminder.
  unique (task_id, user_id, remind_at)
);
create index task_reminders_due_idx on plan.task_reminders (remind_at) where status = 'pending';

create function plan.set_reminder(p_task_id uuid, p_on date, p_at time) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  t plan.tasks;
  zone text;
  at_time timestamptz;
  created uuid;
begin
  select * into t from plan.tasks where id = p_task_id;
  if not found then
    raise exception 'This task could not be found.' using errcode = 'P0002';
  end if;
  perform authz.require_business_permission(t.business_id, 'plan.view');
  if t.status not in ('not_started', 'in_progress', 'blocked') then
    raise exception 'Only an open task can have a reminder.' using errcode = '23514';
  end if;
  select b.time_zone into zone from business.businesses b where b.id = t.business_id;
  at_time := (p_on + p_at) at time zone zone;
  if at_time <= now() then
    raise exception 'Choose a time that has not passed yet.' using errcode = '22023';
  end if;
  insert into plan.task_reminders (business_id, task_id, user_id, remind_at)
  values (t.business_id, t.id, auth.uid(), at_time)
  on conflict (task_id, user_id, remind_at) do update set status = 'pending', sent_at = null
  returning id into created;
  return created;
end $$;
grant execute on function plan.set_reminder(uuid, date, time) to authenticated;

create function plan.snooze_reminder(p_id uuid, p_minutes int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_minutes not between 5 and 10080 then
    raise exception 'Snooze for between five minutes and a week.' using errcode = '22023';
  end if;
  update plan.task_reminders r
     set remind_at = now() + make_interval(mins => p_minutes), status = 'pending', sent_at = null
   where r.id = p_id and r.user_id = auth.uid()
     and exists (select 1 from plan.tasks t where t.id = r.task_id and t.status in ('not_started', 'in_progress', 'blocked'));
  if not found then
    raise exception 'This reminder could not be found.' using errcode = 'P0002';
  end if;
end $$;
grant execute on function plan.snooze_reminder(uuid, int) to authenticated;

create function plan.dismiss_reminder(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update plan.task_reminders set status = 'dismissed' where id = p_id and user_id = auth.uid();
  if not found then
    raise exception 'This reminder could not be found.' using errcode = 'P0002';
  end if;
end $$;
grant execute on function plan.dismiss_reminder(uuid) to authenticated;

-- For the scheduled job. Each reminder is claimed once, so two overlapping runs never send it
-- twice. A reminder inside someone's quiet hours stays pending until a later run.
create function plan.send_due_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  sent int := 0;
  local_time time;
begin
  for r in
    select rem.id, rem.user_id, rem.task_id, t.title, t.due_on, t.status as task_status, b.time_zone, b.name as business_name,
           p.task_reminders, p.quiet_start, p.quiet_end,
           exists (select 1 from business.memberships m
                    where m.business_id = rem.business_id and m.user_id = rem.user_id and m.status = 'active') as is_member
      from plan.task_reminders rem
      join plan.tasks t on t.id = rem.task_id
      join business.businesses b on b.id = rem.business_id
      left join notifications.preferences p on p.user_id = rem.user_id
     where rem.status = 'pending' and rem.remind_at <= now()
     order by rem.remind_at
     limit 500
       for update of rem skip locked
  loop
    if r.task_status not in ('not_started', 'in_progress', 'blocked') or not r.is_member then
      update plan.task_reminders set status = 'cancelled' where id = r.id;
      continue;
    end if;
    if r.task_reminders is false then
      update plan.task_reminders set status = 'skipped' where id = r.id;
      continue;
    end if;
    if r.quiet_start is not null then
      local_time := (now() at time zone r.time_zone)::time;
      if (r.quiet_start < r.quiet_end and local_time >= r.quiet_start and local_time < r.quiet_end)
         or (r.quiet_start > r.quiet_end and (local_time >= r.quiet_start or local_time < r.quiet_end)) then
        continue;
      end if;
    end if;
    perform notifications.deliver(r.user_id, 'task', format('Reminder: %s', r.title),
      case when r.due_on is null then format('A task for %s.', r.business_name)
           else format('A task for %s, due %s.', r.business_name, to_char(r.due_on, 'FMDD Mon YYYY')) end,
      jsonb_build_object('task_id', r.task_id));
    update plan.task_reminders set status = 'sent', sent_at = now() where id = r.id;
    sent := sent + 1;
  end loop;
  return sent;
end $$;

-- An erased account's own reminders go with it (see identity.admin_erase_account).
create function plan.on_account_erased() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.account_status = 'erased' and old.account_status <> 'erased' then
    delete from plan.task_reminders where user_id = new.id;
  end if;
  return new;
end $$;

create trigger plan_account_erased after update of account_status on identity.profiles
  for each row execute function plan.on_account_erased();

------------------------------------------------------------------------------------------------
-- Entity TASK_COMMENT. People edit and remove only their own.

create table plan.task_comments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  task_id     uuid not null,
  author_id   uuid not null references identity.profiles (id) default auth.uid(),
  body        text not null check (length(trim(body)) between 1 and 1000),
  created_at  timestamptz not null default now(),
  edited_at   timestamptz,
  foreign key (task_id, business_id) references plan.tasks (id, business_id) on delete cascade
);
create index task_comments_task_idx on plan.task_comments (task_id, created_at);

create function plan.validate_comment() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.body := trim(new.body);
  if tg_op = 'UPDATE' then
    new.author_id := old.author_id;
    new.created_at := old.created_at;
    new.edited_at := now();
  end if;
  return new;
end $$;

create trigger validate_comment before insert or update on plan.task_comments
  for each row execute function plan.validate_comment();

------------------------------------------------------------------------------------------------
-- Section 4.3: a task's history, from the audit log, for anyone who can see the task. Only the
-- fields that matter to the team are shown, with their old and new values.

create function plan.task_history(p_task_id uuid)
returns table (occurred_at timestamptz, action text, actor_name text, changes jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  biz uuid;
begin
  select t.business_id into biz from plan.tasks t where t.id = p_task_id;
  if not found then
    raise exception 'This task could not be found.' using errcode = 'P0002';
  end if;
  perform authz.require_business_permission(biz, 'plan.view');
  return query
    select c.occurred_at, c.action, p.full_name,
           coalesce((
             select jsonb_object_agg(f.key, jsonb_build_object('from', c.old_data -> f.key, 'to', c.new_data -> f.key))
               from unnest(array['title', 'status', 'priority', 'due_on', 'assigned_to', 'blocker_reason', 'completion_note', 'description']) f(key)
              where c.action = 'INSERT' and f.key in ('title', 'status')
                 or c.action = 'UPDATE' and (c.new_data -> f.key) is distinct from (c.old_data -> f.key)
           ), '{}'::jsonb)
      from audit.record_changes c
      left join identity.profiles p on p.id = c.actor_id
     where c.business_id = biz and c.table_schema = 'plan' and c.table_name = 'tasks' and c.record_id = p_task_id
     order by c.occurred_at desc, c.id desc
     limit 200;
end $$;
grant execute on function plan.task_history(uuid) to authenticated;

------------------------------------------------------------------------------------------------
-- Section 4.5 and entity PLAN_REVIEW: one review per business per week, written by those who
-- manage goals.

create table plan.reviews (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references business.businesses (id) on delete cascade,
  period_start    date not null,
  period_end      date not null,
  summary         text check (char_length(summary) <= 2000),
  wins            text check (char_length(wins) <= 2000),
  blockers        text check (char_length(blockers) <= 2000),
  next_priorities text check (char_length(next_priorities) <= 2000),
  created_at      timestamptz not null default now(),
  created_by      uuid references identity.profiles (id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references identity.profiles (id),
  unique (business_id, period_start),
  check (period_end >= period_start and period_end - period_start <= 31)
);

create function plan.validate_review() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.summary := nullif(trim(new.summary), '');
  new.wins := nullif(trim(new.wins), '');
  new.blockers := nullif(trim(new.blockers), '');
  new.next_priorities := nullif(trim(new.next_priorities), '');
  return new;
end $$;

create trigger validate_review before insert or update on plan.reviews
  for each row execute function plan.validate_review();

------------------------------------------------------------------------------------------------
-- Access (section 10).

select audit.enable_tracking('plan.recurring_rules');
select audit.enable_tracking('plan.events');
select audit.enable_tracking('plan.reviews');
create trigger capture_change after insert or update or delete on plan.task_comments
  for each row execute function audit.capture_change();

alter table plan.recurring_rules enable row level security;
alter table plan.events enable row level security;
alter table plan.task_reminders enable row level security;
alter table plan.task_comments enable row level security;
alter table plan.reviews enable row level security;

create policy rules_read on plan.recurring_rules for select to authenticated
  using (authz.has_business_permission(business_id, 'plan.view'));
create policy rules_insert on plan.recurring_rules for insert to authenticated
  with check (authz.has_business_permission(business_id, 'plan.tasks'));
create policy rules_update on plan.recurring_rules for update to authenticated
  using (authz.has_business_permission(business_id, 'plan.tasks'))
  with check (authz.has_business_permission(business_id, 'plan.tasks'));

create policy events_read on plan.events for select to authenticated
  using (authz.has_business_permission(business_id, 'plan.view'));
create policy events_insert on plan.events for insert to authenticated
  with check (authz.has_business_permission(business_id, 'plan.tasks'));
create policy events_update on plan.events for update to authenticated
  using (authz.has_business_permission(business_id, 'plan.tasks'))
  with check (authz.has_business_permission(business_id, 'plan.tasks'));

-- Written only through the functions above; each person reads their own.
create policy reminders_read on plan.task_reminders for select to authenticated
  using (user_id = (select auth.uid()) and authz.has_business_permission(business_id, 'plan.view'));

create policy comments_read on plan.task_comments for select to authenticated
  using (authz.has_business_permission(business_id, 'plan.view'));
create policy comments_insert on plan.task_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and authz.has_business_permission(business_id, 'plan.tasks'));
create policy comments_update on plan.task_comments for update to authenticated
  using (author_id = (select auth.uid()) and authz.has_business_permission(business_id, 'plan.tasks'))
  with check (author_id = (select auth.uid()));
create policy comments_delete on plan.task_comments for delete to authenticated
  using (author_id = (select auth.uid()) and authz.has_business_permission(business_id, 'plan.tasks'));

create policy reviews_read on plan.reviews for select to authenticated
  using (authz.has_business_permission(business_id, 'plan.view'));
create policy reviews_insert on plan.reviews for insert to authenticated
  with check (authz.has_business_permission(business_id, 'plan.goals'));
create policy reviews_update on plan.reviews for update to authenticated
  using (authz.has_business_permission(business_id, 'plan.goals'))
  with check (authz.has_business_permission(business_id, 'plan.goals'));

grant select on plan.recurring_rules, plan.events, plan.task_reminders, plan.task_comments, plan.reviews to authenticated;
grant insert (business_id, title, description, priority, assigned_to, frequency, interval_count, days_of_week,
              day_of_month, starts_on, ends_on) on plan.recurring_rules to authenticated;
grant update (title, description, priority, assigned_to, ends_on, status) on plan.recurring_rules to authenticated;
grant insert (business_id, title, description, event_type, starts_on, start_time, end_time, status, client_id)
  on plan.events to authenticated;
grant update (title, description, event_type, starts_on, start_time, end_time, status) on plan.events to authenticated;
grant insert (business_id, task_id, body), update (body), delete on plan.task_comments to authenticated;
grant insert (business_id, period_start, period_end, summary, wins, blockers, next_priorities) on plan.reviews to authenticated;
grant update (summary, wins, blockers, next_priorities) on plan.reviews to authenticated;
