-- Plan Module Developer Specification v1.0: the remaining scope.
--   * P2 (section 4.6, journeys 5.2 and 5.3): suggestions from Verida, stored with their sources,
--     period, assumptions and model, and turned into Plan records only when a person accepts them.
--   * P0 offline capture (section 8): the client's own time for a task captured offline.
--   * Section 4.3: tasks linked to sales, expenses, products, activities and measures.
--   * Section 4.2: goals related to several measures.
--   * Section 4.4 and 6.1: repeating events.
--   * Sections 3 and 13: Plan settings an owner controls.
--   * Section 10: retention of suggestions.
-- Plan still never changes a business record or a measure.

------------------------------------------------------------------------------------------------
-- Section 8: when a task was captured on the device, which may be well before it reached us.

alter table plan.tasks add column client_recorded_at timestamptz
  check (client_recorded_at is null or client_recorded_at <= now() + interval '1 day');
grant insert (client_recorded_at) on plan.tasks to authenticated;

------------------------------------------------------------------------------------------------
-- Sections 3 and 13: settings the owner manages.

create table plan.settings (
  business_id            uuid primary key references business.businesses (id) on delete cascade,
  -- Open decision 1: whether tasks can be given to team members, or only to owners.
  allow_staff_assignment boolean not null default true,
  -- Open decision 2: weekly suggestions on request only, or also every Monday morning.
  weekly_suggestions     boolean not null default false,
  -- The time used by "on the due day" reminders.
  default_reminder_time  time not null default '08:00',
  created_at             timestamptz not null default now(),
  created_by             uuid references identity.profiles (id),
  updated_at             timestamptz not null default now(),
  updated_by             uuid references identity.profiles (id)
);

create function plan.settings_for(p_business_id uuid)
returns table (allow_staff_assignment boolean, weekly_suggestions boolean, default_reminder_time time)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'plan.view');
  return query
    select coalesce(s.allow_staff_assignment, true), coalesce(s.weekly_suggestions, false), coalesce(s.default_reminder_time, '08:00'::time)
      from (select 1) one
      left join plan.settings s on s.business_id = p_business_id;
end $$;
grant execute on function plan.settings_for(uuid) to authenticated;

create function plan.save_settings(p_business_id uuid, p_allow_staff_assignment boolean, p_weekly_suggestions boolean, p_default_reminder_time time)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'business.manage');
  insert into plan.settings (business_id, allow_staff_assignment, weekly_suggestions, default_reminder_time, updated_by)
  values (p_business_id, p_allow_staff_assignment, p_weekly_suggestions, p_default_reminder_time, auth.uid())
  on conflict (business_id) do update
    set allow_staff_assignment = excluded.allow_staff_assignment,
        weekly_suggestions = excluded.weekly_suggestions,
        default_reminder_time = excluded.default_reminder_time,
        updated_at = now(),
        updated_by = auth.uid();
end $$;
grant execute on function plan.save_settings(uuid, boolean, boolean, time) to authenticated;

-- Whether a person may be given work in a business, under its settings.
create function plan.assignable(p_business_id uuid, p_user_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from business.memberships m
     where m.business_id = p_business_id and m.user_id = p_user_id and m.status = 'active'
       and (m.role = 'owner'
            or coalesce((select s.allow_staff_assignment from plan.settings s where s.business_id = p_business_id), true))
  );
$$;

-- Replaces the version in 20261119000100: assignment follows the business's settings.
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
     and not plan.assignable(new.business_id, new.assigned_to) then
    raise exception 'A task can only be assigned to a member of this business who may be given tasks.' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.rule_id := old.rule_id;
    new.occurrence_on := old.occurrence_on;
    new.client_recorded_at := old.client_recorded_at;
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
-- Section 4.3: a task can point at the records it is about. A link never copies an amount, so
-- the label names the record only.

create table plan.task_links (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null,
  task_id     uuid not null,
  link_type   text not null check (link_type in ('sale', 'expense', 'product', 'activity', 'kpi')),
  record_id   uuid,
  kpi_code    text references platform.kpi_definitions (code) on update cascade on delete cascade,
  label       text not null check (length(trim(label)) between 1 and 160),
  created_at  timestamptz not null default now(),
  created_by  uuid references identity.profiles (id) default auth.uid(),
  foreign key (task_id, business_id) references plan.tasks (id, business_id) on delete cascade,
  check ((link_type = 'kpi') = (kpi_code is not null) and (link_type = 'kpi') = (record_id is null)),
  unique nulls not distinct (task_id, link_type, record_id, kpi_code)
);
create index task_links_task_idx on plan.task_links (task_id);

create function plan.validate_task_link() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  found_it boolean;
begin
  new.label := trim(new.label);
  found_it := case new.link_type
    when 'sale' then exists (select 1 from records.sales_transactions r where r.id = new.record_id and r.business_id = new.business_id)
    when 'expense' then exists (select 1 from records.expenses r where r.id = new.record_id and r.business_id = new.business_id)
    when 'product' then exists (select 1 from records.products r where r.id = new.record_id and r.business_id = new.business_id)
    when 'activity' then exists (select 1 from operations.activity_records r where r.id = new.record_id and r.business_id = new.business_id)
    else true
  end;
  if not found_it then
    raise exception 'A task can only link to a record of the same business.' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger validate_task_link before insert on plan.task_links
  for each row execute function plan.validate_task_link();

------------------------------------------------------------------------------------------------
-- Section 4.2: a goal can relate to several measures besides the one its progress follows.

create table plan.goal_kpis (
  goal_id     uuid not null,
  business_id uuid not null,
  kpi_code    text not null references platform.kpi_definitions (code) on update cascade on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (goal_id, kpi_code),
  foreign key (goal_id, business_id) references plan.goals (id, business_id) on delete cascade
);

-- The current value of each related measure over the goal's period so far, from the analytics
-- service, with its status. Plan never calculates these itself (section 7.1).
create function plan.goal_measures(p_goal_id uuid)
returns table (code text, name text, unit_kind text, value numeric, status text, note text, period_from date, period_to date)
language plpgsql stable set search_path = '' as $$
declare
  g plan.goals;
  local_today date;
begin
  select * into g from plan.goals where id = p_goal_id;
  if not found then
    raise exception 'This goal could not be found.' using errcode = 'P0002';
  end if;
  local_today := plan.business_today(g.business_id);
  return query
    select k.code, k.name, k.unit_kind, k.value, k.status, k.note, k.period_from, k.period_to
      from analytics.compute_kpis(g.business_id, least(g.start_on, local_today), least(local_today, coalesce(g.target_on, local_today))) k
     where k.code in (select gk.kpi_code from plan.goal_kpis gk where gk.goal_id = g.id)
     order by k.name;
end $$;
grant execute on function plan.goal_measures(uuid) to authenticated;

------------------------------------------------------------------------------------------------
-- Sections 4.4 and 6.1: a series can also produce events, each a distinct occurrence.

alter table plan.recurring_rules
  add column kind       text not null default 'task' check (kind in ('task', 'event')),
  add column event_type text check (event_type in ('meeting', 'delivery', 'appointment', 'deadline', 'other')),
  add column start_time time,
  add column end_time   time,
  add constraint recurring_rules_event_fields check (
    (kind = 'event' and event_type is not null and assigned_to is null)
    or (kind = 'task' and event_type is null and start_time is null and end_time is null)),
  add constraint recurring_rules_event_times check (end_time is null or (start_time is not null and end_time > start_time));

alter table plan.events
  add column rule_id       uuid,
  add column occurrence_on date,
  add column detached      boolean not null default false,
  add constraint events_rule_fk foreign key (rule_id) references plan.recurring_rules (id) on delete cascade,
  add constraint events_occurrence_unique unique (rule_id, occurrence_on),
  add constraint events_occurrence_pair check ((rule_id is null) = (occurrence_on is null));

grant insert (kind, event_type, start_time, end_time) on plan.recurring_rules to authenticated;
grant update (event_type, start_time, end_time) on plan.recurring_rules to authenticated;

create or replace function plan.validate_event() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.title := trim(new.title);
  new.description := nullif(trim(new.description), '');
  if tg_op = 'UPDATE' then
    new.version := old.version + 1;
    new.rule_id := old.rule_id;
    new.occurrence_on := old.occurrence_on;
    if old.rule_id is not null
       and coalesce(current_setting('plan.series_update', true), 'off') <> 'on'
       and (new.title, new.description, new.event_type, new.starts_on, new.start_time, new.end_time)
           is distinct from (old.title, old.description, old.event_type, old.starts_on, old.start_time, old.end_time) then
      new.detached := true;
    end if;
  end if;
  return new;
end $$;

-- Replaces the version in 20261119000100, adding events.
create or replace function plan.materialise_occurrences(p_business_id uuid, p_rule_id uuid default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  tasks_made int;
  events_made int;
begin
  insert into plan.tasks (business_id, title, description, priority, assigned_to, due_on, rule_id, occurrence_on)
  select r.business_id, r.title, r.description, r.priority,
         case when r.assigned_to is not null and plan.assignable(r.business_id, r.assigned_to) then r.assigned_to end,
         d, r.id, d
    from plan.recurring_rules r
   cross join lateral plan.rule_dates(r, r.generate_from, plan.generation_horizon(r.business_id)) d
   where r.business_id = p_business_id and r.kind = 'task' and r.status = 'active'
     and (p_rule_id is null or r.id = p_rule_id)
  on conflict (rule_id, occurrence_on) do nothing;
  get diagnostics tasks_made = row_count;

  insert into plan.events (business_id, title, description, event_type, starts_on, start_time, end_time, rule_id, occurrence_on)
  select r.business_id, r.title, r.description, r.event_type, d, r.start_time, r.end_time, r.id, d
    from plan.recurring_rules r
   cross join lateral plan.rule_dates(r, r.generate_from, plan.generation_horizon(r.business_id)) d
   where r.business_id = p_business_id and r.kind = 'event' and r.status = 'active'
     and (p_rule_id is null or r.id = p_rule_id)
  on conflict (rule_id, occurrence_on) do nothing;
  get diagnostics events_made = row_count;
  return tasks_made + events_made;
end $$;

-- Replaces the version in 20261119000100, adding events.
create or replace function plan.apply_rule_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  local_today date := plan.business_today(new.business_id);
begin
  if tg_op = 'INSERT' then
    perform plan.materialise_occurrences(new.business_id, new.id);
    return new;
  end if;

  perform set_config('plan.series_update', 'on', true);
  if new.kind = 'task' then
    if new.status = 'ended' or new.ends_on is distinct from old.ends_on then
      update plan.tasks t set status = 'cancelled'
       where t.rule_id = new.id and t.status = 'not_started' and not t.detached
         and (t.occurrence_on > local_today and new.status = 'ended' or t.occurrence_on > new.ends_on);
    end if;
    update plan.tasks t
       set title = new.title, description = new.description, priority = new.priority, assigned_to = new.assigned_to
     where t.rule_id = new.id and t.status = 'not_started' and not t.detached and t.occurrence_on >= local_today
       and (t.title, t.description, t.priority, t.assigned_to)
           is distinct from (new.title, new.description, new.priority, new.assigned_to);
  else
    if new.status = 'ended' or new.ends_on is distinct from old.ends_on then
      update plan.events e set status = 'cancelled'
       where e.rule_id = new.id and e.status = 'scheduled' and not e.detached
         and (e.occurrence_on > local_today and new.status = 'ended' or e.occurrence_on > new.ends_on);
    end if;
    update plan.events e
       set title = new.title, description = new.description, event_type = new.event_type,
           start_time = new.start_time, end_time = new.end_time
     where e.rule_id = new.id and e.status = 'scheduled' and not e.detached and e.occurrence_on >= local_today
       and (e.title, e.description, e.event_type, e.start_time, e.end_time)
           is distinct from (new.title, new.description, new.event_type, new.start_time, new.end_time);
  end if;
  perform set_config('plan.series_update', 'off', true);

  if new.status = 'active' then
    perform plan.materialise_occurrences(new.business_id, new.id);
  end if;
  return new;
end $$;

-- Replaces the version in 20261119000100: projected occurrences of event series too.
create or replace function plan.schedule(p_business_id uuid, p_from date, p_to date)
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
    select 'event', e.id, e.rule_id, e.title, e.starts_on, e.start_time, e.end_time,
           e.status, null, null, e.event_type
      from plan.events e
     where e.business_id = p_business_id and e.starts_on between p_from and p_to
    union all
    select 'projected', null, r.id, r.title, d, r.start_time, r.end_time,
           case r.kind when 'task' then 'not_started' else 'scheduled' end,
           case r.kind when 'task' then r.priority end, r.assigned_to, r.event_type
      from plan.recurring_rules r
     cross join lateral plan.rule_dates(r, greatest(p_from, r.generate_from), p_to) d
     where r.business_id = p_business_id and r.status = 'active'
       and not exists (select 1 from plan.tasks t where t.rule_id = r.id and t.occurrence_on = d)
       and not exists (select 1 from plan.events e where e.rule_id = r.id and e.occurrence_on = d)
     order by 5, 6 nulls first, 4;
end $$;

-- Replaces the version in 20261119000100: assignment follows the business's settings.
create or replace function plan.validate_rule() returns trigger
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
    new.kind := old.kind;
    new.version := old.version + 1;
  end if;
  if new.assigned_to is not null
     and (tg_op = 'INSERT' or new.assigned_to is distinct from old.assigned_to)
     and not plan.assignable(new.business_id, new.assigned_to) then
    raise exception 'A task can only be assigned to a member of this business who may be given tasks.' using errcode = '23514';
  end if;
  return new;
end $$;

------------------------------------------------------------------------------------------------
-- Section 4.6 and entities PLAN_RECOMMENDATION and RECOMMENDATION_ACTION. A suggestion is only
-- ever a proposal: no client can write one, and the AI service can only store it. A person
-- with the right permission turns each proposed action into a record, edits it first, or
-- dismisses it.

create table plan.recommendations (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references business.businesses (id) on delete cascade,
  kind          text not null check (kind in ('weekly_plan', 'goal_breakdown', 'insight_actions', 'request')),
  goal_id       uuid,
  -- What the person asked, including availability they gave. Shown back to them.
  request       text check (char_length(request) <= 1000),
  title         text not null check (length(trim(title)) between 1 and 160),
  explanation   text not null check (char_length(explanation) <= 2000),
  assumptions   text check (char_length(assumptions) <= 1000),
  limitations   text check (char_length(limitations) <= 1000),
  -- What it was based on: [{"type": "kpi"|"goal"|"task"|"event", "ref": "...", "label": "..."}].
  sources       jsonb not null default '[]' check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) <= 30),
  period_start  date,
  period_end    date,
  -- ai: drafted by the model. rules: Verida's built-in rules, when the AI is unavailable.
  generator     text not null check (generator in ('ai', 'rules')),
  model         text check (char_length(model) <= 80),
  status        text not null default 'open' check (status in ('open', 'decided', 'dismissed', 'superseded')),
  generated_at  timestamptz not null default now(),
  requested_by  uuid references identity.profiles (id),
  decided_at    timestamptz,
  foreign key (goal_id, business_id) references plan.goals (id, business_id) on delete cascade,
  unique (id, business_id),
  check (period_end is null or period_start is null or period_end >= period_start)
);
create index recommendations_business_idx on plan.recommendations (business_id, status, generated_at desc);

create table plan.recommendation_actions (
  id                uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null,
  business_id       uuid not null,
  action_type       text not null check (action_type in ('create_task', 'update_task', 'create_milestone', 'create_event', 'create_goal')),
  -- Data only, checked against a fixed list of fields (section 6.2: no executable logic).
  proposed_payload  jsonb not null,
  why               text check (char_length(why) <= 300),
  sort_order        int not null default 0,
  approval_status   text not null default 'proposed' check (approval_status in ('proposed', 'accepted', 'edited', 'dismissed')),
  final_payload     jsonb,
  created_task_id      uuid references plan.tasks (id) on delete set null,
  created_goal_id      uuid references plan.goals (id) on delete set null,
  created_event_id     uuid references plan.events (id) on delete set null,
  created_milestone_id uuid references plan.goal_milestones (id) on delete set null,
  decided_by        uuid references identity.profiles (id),
  decided_at        timestamptz,
  foreign key (recommendation_id, business_id) references plan.recommendations (id, business_id) on delete cascade
);
create index recommendation_actions_rec_idx on plan.recommendation_actions (recommendation_id, sort_order);
create index recommendation_actions_task_idx on plan.recommendation_actions (created_task_id) where created_task_id is not null;

-- Checks one action against the fields its type allows, and returns it cleaned. Raises when it
-- names something outside the business, a past date, or a field it may not set.
create function plan.clean_action(p_business_id uuid, p_type text, p_payload jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  allowed text[];
  key text;
  today date := plan.business_today(p_business_id);
  cleaned jsonb := '{}';
  title text;
  longest int;
  due date;
  goal uuid;
  t plan.tasks;
begin
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'A suggested action is not valid.' using errcode = '22023';
  end if;
  allowed := case p_type
    when 'create_task' then array['title', 'description', 'priority', 'due_on', 'goal_ids']
    when 'update_task' then array['task_id', 'due_on', 'priority', 'expected_version', 'task_title']
    when 'create_milestone' then array['goal_id', 'title', 'due_on']
    when 'create_event' then array['title', 'description', 'event_type', 'starts_on', 'start_time', 'end_time']
    when 'create_goal' then array['title', 'description', 'target_on']
  end;
  if allowed is null then
    raise exception 'A suggested action is not valid.' using errcode = '22023';
  end if;
  for key in select jsonb_object_keys(p_payload) loop
    if not key = any (allowed) then
      raise exception 'A suggested action has a field it may not set (%).', key using errcode = '22023';
    end if;
  end loop;

  -- Text fields.
  if p_type <> 'update_task' then
    title := trim(coalesce(p_payload ->> 'title', ''));
    longest := case when p_type = 'create_goal' then 120 else 160 end;
    if char_length(title) not between 1 and longest then
      raise exception 'A suggested action needs a short title.' using errcode = '22023';
    end if;
    cleaned := cleaned || jsonb_build_object('title', title);
    if nullif(trim(p_payload ->> 'description'), '') is not null then
      cleaned := cleaned || jsonb_build_object('description', left(trim(p_payload ->> 'description'), 1000));
    end if;
  end if;

  -- Dates are never in the past.
  foreach key in array array['due_on', 'starts_on', 'target_on'] loop
    if p_payload ? key and p_payload ->> key is not null then
      begin
        due := (p_payload ->> key)::date;
      exception when others then
        raise exception 'A suggested date is not valid.' using errcode = '22023';
      end;
      if due < today then
        raise exception 'A suggested date has already passed.' using errcode = '22023';
      end if;
      cleaned := cleaned || jsonb_build_object(key, due);
    end if;
  end loop;

  if p_payload ? 'priority' and p_payload ->> 'priority' is not null then
    if p_payload ->> 'priority' not in ('low', 'normal', 'high', 'urgent') then
      raise exception 'A suggested priority is not valid.' using errcode = '22023';
    end if;
    cleaned := cleaned || jsonb_build_object('priority', p_payload ->> 'priority');
  end if;

  case p_type
    when 'create_task' then
      if p_payload ? 'goal_ids' and jsonb_typeof(p_payload -> 'goal_ids') = 'array' then
        for key in select jsonb_array_elements_text(p_payload -> 'goal_ids') loop
          if not exists (select 1 from plan.goals g where g.id::text = key and g.business_id = p_business_id) then
            raise exception 'A suggestion names a goal outside this business.' using errcode = '22023';
          end if;
        end loop;
        cleaned := cleaned || jsonb_build_object('goal_ids', p_payload -> 'goal_ids');
      end if;
    when 'update_task' then
      select * into t from plan.tasks k where k.id::text = p_payload ->> 'task_id' and k.business_id = p_business_id;
      if not found then
        raise exception 'A suggestion names a task outside this business.' using errcode = '22023';
      end if;
      if t.status not in ('not_started', 'in_progress', 'blocked') then
        raise exception 'A suggestion changes a task that is already closed.' using errcode = '22023';
      end if;
      if not (cleaned ? 'due_on' or cleaned ? 'priority') then
        raise exception 'A suggested change must move the date or the priority.' using errcode = '22023';
      end if;
      cleaned := cleaned || jsonb_build_object('task_id', t.id, 'task_title', t.title,
        'expected_version', coalesce((p_payload ->> 'expected_version')::int, t.version));
    when 'create_milestone' then
      select g.id into goal from plan.goals g where g.id::text = p_payload ->> 'goal_id' and g.business_id = p_business_id;
      if goal is null then
        raise exception 'A suggestion names a goal outside this business.' using errcode = '22023';
      end if;
      cleaned := cleaned || jsonb_build_object('goal_id', goal);
    when 'create_event' then
      if not cleaned ? 'starts_on' then
        raise exception 'A suggested event needs a day.' using errcode = '22023';
      end if;
      cleaned := cleaned || jsonb_build_object('event_type',
        case when p_payload ->> 'event_type' in ('meeting', 'delivery', 'appointment', 'deadline', 'other') then p_payload ->> 'event_type' else 'other' end);
      if nullif(p_payload ->> 'start_time', '') is not null then
        cleaned := cleaned || jsonb_build_object('start_time', (p_payload ->> 'start_time')::time);
        if nullif(p_payload ->> 'end_time', '') is not null then
          if (p_payload ->> 'end_time')::time <= (p_payload ->> 'start_time')::time then
            raise exception 'A suggested event ends before it starts.' using errcode = '22023';
          end if;
          cleaned := cleaned || jsonb_build_object('end_time', (p_payload ->> 'end_time')::time);
        end if;
      end if;
    else
      null;
  end case;
  return cleaned;
end $$;

-- Internal: called by the AI service (with the service key) and by the built-in rules. Stores a
-- suggestion and replaces any earlier open one of the same kind, which the person can no longer act on.
create function plan.store_recommendation(
  p_business_id uuid, p_user_id uuid, p_kind text, p_goal_id uuid, p_request text,
  p_title text, p_explanation text, p_assumptions text, p_limitations text, p_sources jsonb,
  p_period_start date, p_period_end date, p_generator text, p_model text, p_actions jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  created uuid;
  action jsonb;
  position int := 0;
begin
  if jsonb_typeof(p_actions) <> 'array' or jsonb_array_length(p_actions) > 10 then
    raise exception 'A suggestion has too many actions.' using errcode = '22023';
  end if;
  if p_user_id is not null and not exists (
    select 1 from business.memberships m where m.business_id = p_business_id and m.user_id = p_user_id and m.status = 'active') then
    raise exception 'Only a member of the business can receive its suggestions.' using errcode = '42501';
  end if;

  update plan.recommendations r set status = 'superseded'
   where r.business_id = p_business_id and r.kind = p_kind and r.status = 'open'
     and r.goal_id is not distinct from p_goal_id;

  insert into plan.recommendations (business_id, kind, goal_id, request, title, explanation, assumptions, limitations,
                                    sources, period_start, period_end, generator, model, requested_by)
  values (p_business_id, p_kind, p_goal_id, nullif(trim(p_request), ''), trim(p_title), trim(p_explanation),
          nullif(trim(p_assumptions), ''), nullif(trim(p_limitations), ''), coalesce(p_sources, '[]'),
          p_period_start, p_period_end, p_generator, p_model, p_user_id)
  returning id into created;

  for action in select * from jsonb_array_elements(p_actions) loop
    insert into plan.recommendation_actions (recommendation_id, business_id, action_type, proposed_payload, why, sort_order)
    values (created, p_business_id, action ->> 'type',
            plan.clean_action(p_business_id, action ->> 'type', coalesce(action -> 'payload', '{}')),
            left(nullif(trim(action ->> 'why'), ''), 300), position);
    position := position + 1;
  end loop;
  return created;
end $$;

-- Marks a suggestion decided once nothing in it is waiting.
create function plan.settle_recommendation(p_id uuid) returns void
language sql security definer set search_path = '' as $$
  update plan.recommendations r set status = 'decided', decided_at = now()
   where r.id = p_id and r.status = 'open'
     and not exists (select 1 from plan.recommendation_actions a where a.recommendation_id = p_id and a.approval_status = 'proposed');
$$;

-- Section 4.6: on approval, creates the record through the same rules as any other, and keeps a
-- link back to the suggestion. Edits may change only the fields the action allows.
create function plan.accept_action(p_action_id uuid, p_edits jsonb default '{}') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  a plan.recommendation_actions;
  rec plan.recommendations;
  payload jsonb;
  made uuid;
  edited boolean;
  goal text;
begin
  select * into a from plan.recommendation_actions where id = p_action_id for update;
  if not found then
    raise exception 'This suggestion could not be found.' using errcode = 'P0002';
  end if;
  select * into rec from plan.recommendations where id = a.recommendation_id;
  perform authz.require_business_permission(a.business_id,
    case when a.action_type in ('create_milestone', 'create_goal') then 'plan.goals' else 'plan.tasks' end);
  if a.approval_status <> 'proposed' then
    raise exception 'This suggestion has already been decided.' using errcode = 'P0001';
  end if;
  if rec.status in ('superseded', 'dismissed') then
    raise exception 'This suggestion has been replaced. Open the newest one.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(coalesce(p_edits, '{}')) <> 'object' then
    raise exception 'The changes are not valid.' using errcode = '22023';
  end if;

  payload := plan.clean_action(a.business_id, a.action_type, a.proposed_payload || coalesce(p_edits, '{}'));
  edited := payload is distinct from a.proposed_payload;

  case a.action_type
    when 'create_task' then
      insert into plan.tasks (business_id, title, description, priority, due_on)
      values (a.business_id, payload ->> 'title', payload ->> 'description', coalesce(payload ->> 'priority', 'normal'), (payload ->> 'due_on')::date)
      returning id into made;
      if payload ? 'goal_ids' then
        for goal in select jsonb_array_elements_text(payload -> 'goal_ids') loop
          insert into plan.task_goals (task_id, goal_id, business_id) values (made, goal::uuid, a.business_id) on conflict do nothing;
        end loop;
      end if;
      update plan.recommendation_actions set created_task_id = made where id = a.id;
    when 'update_task' then
      -- Section 4.6: never silently; and only if the task is as it was when suggested.
      update plan.tasks t
         set due_on = coalesce((payload ->> 'due_on')::date, t.due_on),
             priority = coalesce(payload ->> 'priority', t.priority)
       where t.id = (payload ->> 'task_id')::uuid and t.version = (payload ->> 'expected_version')::int
      returning t.id into made;
      if made is null then
        raise exception 'This task has changed since Verida suggested this. Dismiss the suggestion or ask again.' using errcode = 'P0001';
      end if;
      update plan.recommendation_actions set created_task_id = made where id = a.id;
    when 'create_milestone' then
      insert into plan.goal_milestones (business_id, goal_id, title, due_on, sort_order)
      values (a.business_id, (payload ->> 'goal_id')::uuid, payload ->> 'title', (payload ->> 'due_on')::date,
              coalesce((select max(m.sort_order) + 1 from plan.goal_milestones m where m.goal_id = (payload ->> 'goal_id')::uuid), 1))
      returning id into made;
      update plan.recommendation_actions set created_milestone_id = made where id = a.id;
    when 'create_event' then
      insert into plan.events (business_id, title, description, event_type, starts_on, start_time, end_time)
      values (a.business_id, payload ->> 'title', payload ->> 'description', payload ->> 'event_type',
              (payload ->> 'starts_on')::date, (payload ->> 'start_time')::time, (payload ->> 'end_time')::time)
      returning id into made;
      update plan.recommendation_actions set created_event_id = made where id = a.id;
    when 'create_goal' then
      -- Verida never invents a target, so a suggested goal is tracked by milestones.
      insert into plan.goals (business_id, title, description, goal_type, start_on, target_on)
      values (a.business_id, payload ->> 'title', payload ->> 'description', 'milestone',
              plan.business_today(a.business_id), (payload ->> 'target_on')::date)
      returning id into made;
      update plan.recommendation_actions set created_goal_id = made where id = a.id;
  end case;

  update plan.recommendation_actions
     set approval_status = case when edited then 'edited' else 'accepted' end,
         final_payload = payload, decided_by = auth.uid(), decided_at = now()
   where id = a.id;
  perform plan.settle_recommendation(a.recommendation_id);
  return made;
end $$;
grant execute on function plan.accept_action(uuid, jsonb) to authenticated;

create function plan.dismiss_action(p_action_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  a plan.recommendation_actions;
begin
  select * into a from plan.recommendation_actions where id = p_action_id for update;
  if not found then
    raise exception 'This suggestion could not be found.' using errcode = 'P0002';
  end if;
  perform authz.require_business_permission(a.business_id, 'plan.tasks');
  if a.approval_status <> 'proposed' then
    raise exception 'This suggestion has already been decided.' using errcode = 'P0001';
  end if;
  update plan.recommendation_actions set approval_status = 'dismissed', decided_by = auth.uid(), decided_at = now() where id = a.id;
  perform plan.settle_recommendation(a.recommendation_id);
end $$;
grant execute on function plan.dismiss_action(uuid) to authenticated;

create function plan.dismiss_recommendation(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  rec plan.recommendations;
begin
  select * into rec from plan.recommendations where id = p_id for update;
  if not found then
    raise exception 'This suggestion could not be found.' using errcode = 'P0002';
  end if;
  perform authz.require_business_permission(rec.business_id, 'plan.tasks');
  update plan.recommendation_actions set approval_status = 'dismissed', decided_by = auth.uid(), decided_at = now()
   where recommendation_id = p_id and approval_status = 'proposed';
  update plan.recommendations set status = 'dismissed', decided_at = now() where id = p_id and status = 'open';
end $$;
grant execute on function plan.dismiss_recommendation(uuid) to authenticated;

-- What the AI service may read about a business: the person asking must be able to plan in it.
create function plan.assistant_context_allowed(p_business_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select authz.has_business_permission(p_business_id, 'plan.tasks');
$$;
grant execute on function plan.assistant_context_allowed(uuid) to authenticated;

------------------------------------------------------------------------------------------------
-- Built-in suggestions, used when the AI service is unavailable or not configured, and for the
-- optional Monday suggestions. They come only from the business's own plan and measures, and
-- explain where each one comes from.

create function plan.rule_actions(p_business_id uuid, p_kind text, p_goal_id uuid)
returns table (actions jsonb, sources jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  today date := plan.business_today(p_business_id);
  list jsonb := '[]';
  refs jsonb := '[]';
  r record;
  g plan.goals;
begin
  if p_kind in ('weekly_plan', 'request') then
    for r in
      select t.id, t.title, t.due_on, t.version from plan.tasks t
       where t.business_id = p_business_id and t.status in ('not_started', 'in_progress') and t.due_on < today
       order by t.due_on limit 3
    loop
      list := list || jsonb_build_array(jsonb_build_object('type', 'update_task', 'why',
        format('Overdue since %s. Choose a new date you can keep, or complete it.', to_char(r.due_on, 'FMDD Mon')),
        'payload', jsonb_build_object('task_id', r.id, 'due_on', today + 1, 'expected_version', r.version)));
      refs := refs || jsonb_build_array(jsonb_build_object('type', 'task', 'ref', r.id, 'label', r.title));
    end loop;
    for r in
      select t.id, t.title, t.blocker_reason from plan.tasks t
       where t.business_id = p_business_id and t.status = 'blocked' order by t.updated_at limit 2
    loop
      list := list || jsonb_build_array(jsonb_build_object('type', 'create_task', 'why', format('"%s" is blocked: %s', r.title, r.blocker_reason),
        'payload', jsonb_build_object('title', left(format('Clear the blocker on %s', r.title), 160), 'priority', 'high', 'due_on', today + 1)));
      refs := refs || jsonb_build_array(jsonb_build_object('type', 'task', 'ref', r.id, 'label', r.title));
    end loop;
    for r in
      select g2.id, g2.title, g2.target_on from plan.goals g2
       where g2.business_id = p_business_id and g2.status in ('active', 'at_risk')
         and not exists (select 1 from plan.task_goals tg join plan.tasks t on t.id = tg.task_id
                          where tg.goal_id = g2.id and t.status in ('not_started', 'in_progress', 'blocked'))
       order by g2.target_on nulls last limit 3
    loop
      list := list || jsonb_build_array(jsonb_build_object('type', 'create_task', 'why', 'This goal has no open task, so nothing is moving it forward this week.',
        'payload', jsonb_build_object('title', left(format('Next step for: %s', r.title), 160), 'due_on', today + 3, 'goal_ids', jsonb_build_array(r.id))));
      refs := refs || jsonb_build_array(jsonb_build_object('type', 'goal', 'ref', r.id, 'label', r.title));
    end loop;
    for r in
      select g2.id, g2.title, g2.target_on from plan.goals g2
       where g2.business_id = p_business_id and g2.status in ('active', 'at_risk')
         and g2.target_on between today and today + 14
       order by g2.target_on limit 2
    loop
      list := list || jsonb_build_array(jsonb_build_object('type', 'create_task', 'why', format('The target date is %s.', to_char(r.target_on, 'FMDD Mon')),
        'payload', jsonb_build_object('title', left(format('Review progress on %s', r.title), 160), 'due_on', greatest(today, r.target_on - 3), 'goal_ids', jsonb_build_array(r.id))));
    end loop;
  elsif p_kind = 'goal_breakdown' then
    select * into g from plan.goals where id = p_goal_id and business_id = p_business_id;
    if not found then
      raise exception 'This goal could not be found.' using errcode = 'P0002';
    end if;
    refs := jsonb_build_array(jsonb_build_object('type', 'goal', 'ref', g.id, 'label', g.title));
    if g.goal_type = 'milestone' then
      list := jsonb_build_array(
        jsonb_build_object('type', 'create_milestone', 'why', 'A first step makes progress visible.',
          'payload', jsonb_build_object('goal_id', g.id, 'title', 'Agree the first step and who does it', 'due_on', today + 3)),
        jsonb_build_object('type', 'create_milestone', 'why', 'A check halfway catches problems early.',
          'payload', jsonb_build_object('goal_id', g.id, 'title', 'Check progress halfway', 'due_on',
            case when g.target_on is null then today + 14 else greatest(today, g.start_on + (g.target_on - g.start_on) / 2) end)),
        jsonb_build_object('type', 'create_task', 'why', 'Writing the steps down turns the goal into work.',
          'payload', jsonb_build_object('title', left(format('List the steps for %s', g.title), 160), 'due_on', today + 2, 'goal_ids', jsonb_build_array(g.id))));
    else
      if g.baseline_value is null and g.direction in ('increase', 'decrease') then
        list := list || jsonb_build_array(jsonb_build_object('type', 'create_task', 'why', 'Without a starting value, progress cannot be shown as a percentage.',
          'payload', jsonb_build_object('title', left(format('Record the starting value for %s', g.title), 160), 'due_on', today + 1, 'goal_ids', jsonb_build_array(g.id))));
      end if;
      if g.kpi_code is null then
        list := list || jsonb_build_array(jsonb_build_object('type', 'create_task', 'why', 'Progress for this goal is recorded by hand, so it needs a regular update.',
          'payload', jsonb_build_object('title', left(format('Record progress on %s', g.title), 160), 'due_on', today + 7, 'goal_ids', jsonb_build_array(g.id))));
      end if;
      list := list || jsonb_build_array(jsonb_build_object('type', 'create_task', 'why', 'A short weekly look at the figures keeps the goal in view.',
        'payload', jsonb_build_object('title', left(format('Review %s with the team', g.title), 160), 'due_on', today + 6, 'goal_ids', jsonb_build_array(g.id))));
    end if;
  elsif p_kind = 'insight_actions' then
    for r in
      select k.code, k.name, k.note from analytics.compute_kpis(p_business_id, today - 29, today) k
       where k.status = 'unavailable' and k.note is not null order by k.name limit 3
    loop
      list := list || jsonb_build_array(jsonb_build_object('type', 'create_task', 'why', format('%s cannot be calculated yet: %s', r.name, r.note),
        'payload', jsonb_build_object('title', left(format('Record what %s needs', r.name), 160), 'due_on', today + 2)));
      refs := refs || jsonb_build_array(jsonb_build_object('type', 'kpi', 'ref', r.code, 'label', r.name));
    end loop;
  end if;
  return query select list, refs;
end $$;

create function plan.suggest_from_rules(p_business_id uuid, p_kind text, p_goal_id uuid default null, p_request text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  found_actions jsonb;
  found_sources jsonb;
  today date;
begin
  perform authz.require_business_permission(p_business_id, 'plan.tasks');
  if p_kind not in ('weekly_plan', 'goal_breakdown', 'insight_actions', 'request') then
    raise exception 'This kind of suggestion is not available.' using errcode = '22023';
  end if;
  today := plan.business_today(p_business_id);
  select r.actions, r.sources into found_actions, found_sources from plan.rule_actions(p_business_id, p_kind, p_goal_id) r;
  if jsonb_array_length(found_actions) = 0 then
    return null;
  end if;
  return plan.store_recommendation(
    p_business_id, auth.uid(), p_kind, p_goal_id, p_request,
    case p_kind when 'goal_breakdown' then 'Steps for this goal' when 'insight_actions' then 'Actions from your figures' else 'Suggestions for this week' end,
    case p_kind
      when 'goal_breakdown' then 'Simple steps that suit this kind of goal, from Verida''s built-in planning rules.'
      when 'insight_actions' then 'Measures that cannot be calculated yet, and what to record so they can be.'
      else 'Overdue and blocked work, and goals that nothing is moving forward, from your own plan.' end,
    null,
    case when p_kind = 'request' and p_request is not null
         then 'Your request was not read: these come from built-in rules because the AI service was not available.' end,
    found_sources, today, today + 6, 'rules', null, found_actions);
end $$;
grant execute on function plan.suggest_from_rules(uuid, text, uuid, text) to authenticated;

-- For the Monday job, for businesses that asked for weekly suggestions.
create function plan.weekly_rule_suggestions() returns int
language plpgsql security definer set search_path = '' as $$
declare
  biz uuid;
  found_actions jsonb;
  found_sources jsonb;
  made int := 0;
  today date;
begin
  for biz in select s.business_id from plan.settings s join business.businesses b on b.id = s.business_id
              where s.weekly_suggestions and b.status = 'active' loop
    today := plan.business_today(biz);
    select r.actions, r.sources into found_actions, found_sources from plan.rule_actions(biz, 'weekly_plan', null) r;
    if jsonb_array_length(found_actions) > 0 then
      perform plan.store_recommendation(biz, null, 'weekly_plan', null, null, 'Suggestions for this week',
        'Overdue and blocked work, and goals that nothing is moving forward, from your own plan.',
        null, null, found_sources, today, today + 6, 'rules', null, found_actions);
      made := made + 1;
    end if;
  end loop;
  return made;
end $$;

-- Section 10: suggestions nobody acted on are removed after 90 days. Ones that created a record
-- stay, so the record keeps its provenance.
create function plan.purge_old_recommendations() returns int
language plpgsql security definer set search_path = '' as $$
declare
  removed int;
begin
  delete from plan.recommendations r
   where r.status in ('dismissed', 'superseded', 'open')
     and r.generated_at < now() - interval '90 days'
     and not exists (select 1 from plan.recommendation_actions a
                      where a.recommendation_id = r.id and a.approval_status in ('accepted', 'edited'));
  get diagnostics removed = row_count;
  return removed;
end $$;

------------------------------------------------------------------------------------------------
-- Access (section 10).

select audit.enable_tracking('plan.settings');
create trigger capture_change after insert or update or delete on plan.task_links
  for each row execute function audit.capture_change();
create trigger capture_change after insert or update or delete on plan.goal_kpis
  for each row execute function audit.capture_change();
-- Section 10: approvals and dismissals are logged.
create trigger capture_change after insert or update or delete on plan.recommendations
  for each row execute function audit.capture_change();
create trigger capture_change after insert or update or delete on plan.recommendation_actions
  for each row execute function audit.capture_change();

alter table plan.settings enable row level security;
alter table plan.task_links enable row level security;
alter table plan.goal_kpis enable row level security;
alter table plan.recommendations enable row level security;
alter table plan.recommendation_actions enable row level security;

-- Settings are read and written through the functions above.
create policy task_links_read on plan.task_links for select to authenticated
  using (authz.has_business_permission(business_id, 'plan.view'));
create policy task_links_insert on plan.task_links for insert to authenticated
  with check (authz.has_business_permission(business_id, 'plan.tasks'));
create policy task_links_delete on plan.task_links for delete to authenticated
  using (authz.has_business_permission(business_id, 'plan.tasks'));

create policy goal_kpis_read on plan.goal_kpis for select to authenticated
  using (authz.has_business_permission(business_id, 'plan.view'));
create policy goal_kpis_insert on plan.goal_kpis for insert to authenticated
  with check (authz.has_business_permission(business_id, 'plan.goals'));
create policy goal_kpis_delete on plan.goal_kpis for delete to authenticated
  using (authz.has_business_permission(business_id, 'plan.goals'));

create policy recommendations_read on plan.recommendations for select to authenticated
  using (authz.has_business_permission(business_id, 'plan.view'));
create policy recommendation_actions_read on plan.recommendation_actions for select to authenticated
  using (authz.has_business_permission(business_id, 'plan.view'));

grant select on plan.task_links, plan.goal_kpis, plan.recommendations, plan.recommendation_actions to authenticated;
grant insert (business_id, task_id, link_type, record_id, kpi_code, label), delete on plan.task_links to authenticated;
grant insert (goal_id, business_id, kpi_code), delete on plan.goal_kpis to authenticated;
