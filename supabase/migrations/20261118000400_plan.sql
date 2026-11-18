-- Plan Module Developer Specification v1.0, P0 (Core Plan): goals, milestones, progress
-- observations, tasks and the links between tasks and goals, with the calculations of section 7.
-- Plan manages intentions and commitments. It never changes a business record or a measure.

create schema if not exists plan;
grant usage on schema plan to authenticated, service_role;
alter default privileges in schema plan grant all on tables to service_role;
alter default privileges in schema plan grant execute on functions to service_role;

------------------------------------------------------------------------------------------------
-- Fixes the erasure order from 20261103001600. Activities can now link to sales, so they must be
-- removed before the sales they point to.

create or replace function business.admin_erase_business(p_id uuid) returns void
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

  delete from operations.activity_records where business_id = p_id;
  delete from records.sales_transactions where business_id = p_id;
  delete from records.expenses where business_id = p_id;
  delete from business.businesses where id = p_id;

  -- Deleting the rows copied them into the audit log, which would defeat the purpose.
  delete from audit.record_changes where business_id = p_id;
  insert into audit.record_changes (table_schema, table_name, record_id, action, actor_id)
  values ('business', 'businesses', p_id, 'DELETE', auth.uid());
end $$;

------------------------------------------------------------------------------------------------
-- Section 4.4: each business plans in its own time zone. Botswana is the default.

alter table business.businesses
  add column time_zone text not null default 'Africa/Gaborone' check (char_length(time_zone) between 1 and 64);

create function plan.business_today(p_business_id uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone b.time_zone)::date from business.businesses b where b.id = p_business_id;
$$;
grant execute on function plan.business_today(uuid) to authenticated;

------------------------------------------------------------------------------------------------
-- Section 3: who may do what. Owners and managers run goals; staff work on tasks.

insert into authz.permissions (code, description) values
  ('plan.view',  'View goals, tasks and progress'),
  ('plan.tasks', 'Create, update, assign and complete tasks'),
  ('plan.goals', 'Create and manage goals, milestones and progress');

insert into authz.role_permissions (role, permission) values
  ('owner', 'plan.view'), ('owner', 'plan.tasks'), ('owner', 'plan.goals'),
  ('manager', 'plan.view'), ('manager', 'plan.tasks'), ('manager', 'plan.goals'),
  ('staff', 'plan.view'), ('staff', 'plan.tasks'),
  ('viewer', 'plan.view');

------------------------------------------------------------------------------------------------
-- Goals (section 4.2, entities BUSINESS_GOAL and GOAL_METRIC).

create table plan.goals (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references business.businesses (id) on delete cascade,
  title          text not null check (length(trim(title)) between 1 and 120),
  description    text check (char_length(description) <= 1000),
  -- measurable: a target value. milestone: progress through milestones and status, no percentage.
  goal_type      text not null check (goal_type in ('measurable', 'milestone')),
  direction      text check (direction in ('increase', 'decrease', 'maintain', 'threshold')),
  unit           text check (char_length(unit) <= 30),
  baseline_value numeric(18, 3),
  target_value   numeric(18, 3),
  -- How far from the target still counts as on track, for a goal to maintain a level.
  tolerance      numeric(18, 3) check (tolerance is null or tolerance >= 0),
  -- Progress can come from a measure the analytics service already calculates.
  kpi_code       text references platform.kpi_definitions (code) on update cascade,
  start_on       date not null default current_date,
  target_on      date,
  status         text not null default 'active'
                 check (status in ('active', 'on_hold', 'at_risk', 'completed', 'cancelled', 'expired')),
  status_reason  text check (char_length(status_reason) <= 300),
  created_at     timestamptz not null default now(),
  created_by     uuid references identity.profiles (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references identity.profiles (id),
  unique (id, business_id),
  check (target_on is null or target_on >= start_on),
  check (goal_type = 'milestone' or (direction is not null and target_value is not null)),
  check (goal_type = 'measurable' or (direction is null and target_value is null and baseline_value is null and kpi_code is null))
);
create index goals_business_status_idx on plan.goals (business_id, status);

create function plan.validate_goal() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.title := trim(new.title);
  new.description := nullif(trim(new.description), '');
  new.unit := nullif(trim(new.unit), '');
  new.status_reason := nullif(trim(new.status_reason), '');
  if new.status = 'cancelled' and new.status_reason is null then
    raise exception 'Say why the goal is cancelled.' using errcode = '23514';
  end if;
  if new.direction in ('increase', 'decrease') and new.baseline_value is not null and new.baseline_value = new.target_value then
    raise exception 'The target must differ from the starting value.' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger validate_goal before insert or update on plan.goals
  for each row execute function plan.validate_goal();

-- Section 4.2: dated progress observations, recorded by a person. They are never edited; a
-- later observation replaces an earlier one.
create table plan.goal_progress (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null,
  goal_id      uuid not null,
  recorded_on  date not null,
  actual_value numeric(18, 3) not null,
  note         text check (char_length(note) <= 300),
  created_at   timestamptz not null default now(),
  created_by   uuid references identity.profiles (id) default auth.uid(),
  foreign key (goal_id, business_id) references plan.goals (id, business_id) on delete cascade
);
create index goal_progress_goal_idx on plan.goal_progress (goal_id, recorded_on desc, created_at desc);

-- Section 4.2 and entity GOAL_MILESTONE.
create table plan.goal_milestones (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null,
  goal_id      uuid not null,
  title        text not null check (length(trim(title)) between 1 and 120),
  due_on       date,
  status       text not null default 'pending' check (status in ('pending', 'completed')),
  completed_at timestamptz,
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  created_by   uuid references identity.profiles (id),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references identity.profiles (id),
  foreign key (goal_id, business_id) references plan.goals (id, business_id) on delete cascade
);
create index goal_milestones_goal_idx on plan.goal_milestones (goal_id, sort_order);

create function plan.stamp_completion() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status <> 'completed') then
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger stamp_completion before insert or update of status on plan.goal_milestones
  for each row execute function plan.stamp_completion();

------------------------------------------------------------------------------------------------
-- Tasks (section 4.3, entity PLAN_TASK).

create table plan.tasks (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references business.businesses (id) on delete cascade,
  title           text not null check (length(trim(title)) between 1 and 160),
  description     text check (char_length(description) <= 2000),
  priority        text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status          text not null default 'not_started'
                  check (status in ('not_started', 'in_progress', 'blocked', 'completed', 'cancelled')),
  -- A business day, so no time zone can move it (as for records).
  due_on          date,
  completed_at    timestamptz,
  completion_note text check (char_length(completion_note) <= 500),
  blocker_reason  text check (char_length(blocker_reason) <= 500),
  assigned_to     uuid references identity.profiles (id),
  -- Section 6.2: concurrency and idempotency for edits from several devices, and offline later.
  version         int not null default 1,
  client_id       uuid unique,
  created_at      timestamptz not null default now(),
  created_by      uuid references identity.profiles (id),
  updated_at      timestamptz not null default now(),
  updated_by      uuid references identity.profiles (id),
  unique (id, business_id)
);
create index tasks_business_status_due_idx on plan.tasks (business_id, status, due_on);
create index tasks_assigned_idx on plan.tasks (assigned_to) where assigned_to is not null;

create function plan.validate_task() returns trigger
language plpgsql security definer set search_path = '' as $$
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
    new.completed_at := now();
  elsif new.status <> 'completed' then
    new.completed_at := null;
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
  end if;
  return new;
end $$;

create trigger validate_task before insert or update on plan.tasks
  for each row execute function plan.validate_task();

-- Section 4.2 and 4.3: many-to-many, so a task can support several goals and a goal many tasks.
create table plan.task_goals (
  task_id     uuid not null,
  goal_id     uuid not null,
  business_id uuid not null,
  created_at  timestamptz not null default now(),
  primary key (task_id, goal_id),
  foreign key (task_id, business_id) references plan.tasks (id, business_id) on delete cascade,
  foreign key (goal_id, business_id) references plan.goals (id, business_id) on delete cascade
);
create index task_goals_goal_idx on plan.task_goals (goal_id);

------------------------------------------------------------------------------------------------
-- Section 7: calculations. They run as the caller, so row-level security applies.

-- Overview counts and task measures for a period, in the business's own calendar.
create function plan.overview(p_business_id uuid, p_from date, p_to date)
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
      select k.*, (k.completed_at at time zone zone)::date as completed_on
        from plan.tasks k where k.business_id = p_business_id
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
grant execute on function plan.overview(uuid, date, date) to authenticated;

-- Section 7 and 7.1: a goal's latest actual value and how far it has come. The percentage is
-- given only where the formula is valid, and the reason otherwise.
create function plan.goal_progress(p_goal_id uuid)
returns table (
  actual numeric, actual_on date, source text, percent numeric, progress_status text, note text,
  milestones_done int, milestones_total int
)
language plpgsql stable set search_path = '' as $$
declare
  g plan.goals;
  zone text;
  local_today date;
  kpi_value numeric;
  kpi_status text;
  kpi_to date;
  span numeric;
begin
  select * into g from plan.goals where id = p_goal_id;
  if not found then
    raise exception 'This goal could not be found.' using errcode = 'P0002';
  end if;
  select b.time_zone into zone from business.businesses b where b.id = g.business_id;
  local_today := (now() at time zone zone)::date;

  select count(*) filter (where m.status = 'completed')::int, count(*)::int
    into milestones_done, milestones_total
    from plan.goal_milestones m where m.goal_id = g.id;

  if g.goal_type = 'milestone' then
    source := 'milestones';
    progress_status := case when milestones_total = 0 then 'no_milestones'
                            when milestones_done = milestones_total then 'all_milestones_done'
                            else 'in_progress' end;
    note := case when milestones_total = 0 then 'Add milestones to track this goal.'
                 else format('%s of %s milestones completed.', milestones_done, milestones_total) end;
    return next;
    return;
  end if;

  -- A measure from the analytics service, over the goal's period so far.
  if g.kpi_code is not null then
    select k.value, k.status, k.period_to into kpi_value, kpi_status, kpi_to
      from analytics.compute_kpis(g.business_id, g.start_on, least(local_today, coalesce(g.target_on, local_today))) k
     where k.code = g.kpi_code;
    if kpi_value is not null then
      actual := kpi_value;
      actual_on := kpi_to;
      source := case kpi_status when 'actual' then 'kpi' else 'kpi_estimated' end;
    end if;
  end if;
  if actual is null then
    select p.actual_value, p.recorded_on into actual, actual_on
      from plan.goal_progress p where p.goal_id = g.id
     order by p.recorded_on desc, p.created_at desc limit 1;
    if actual is not null then
      source := 'manual';
    end if;
  end if;

  if actual is null then
    progress_status := 'no_data';
    note := case when g.kpi_code is not null then 'The measure has no value for this period yet.'
                 else 'Record progress to see how far the goal has come.' end;
    return next;
    return;
  end if;

  case g.direction
    when 'increase', 'decrease' then
      if g.baseline_value is null then
        progress_status := 'percent_unavailable';
        note := 'Add a starting value to see the percentage.';
      else
        span := case g.direction when 'increase' then g.target_value - g.baseline_value else g.baseline_value - g.target_value end;
        if span <= 0 then
          progress_status := 'percent_unavailable';
          note := case g.direction when 'increase' then 'The target is not above the starting value.'
                                   else 'The target is not below the starting value.' end;
        else
          percent := round((case g.direction when 'increase' then actual - g.baseline_value else g.baseline_value - actual end) / span * 100, 1);
          progress_status := case when percent >= 100 then 'target_met' else 'in_progress' end;
          note := case when percent > 100 then 'The target has been passed.' else null end;
        end if;
      end if;
    when 'maintain' then
      progress_status := case when abs(actual - g.target_value) <= coalesce(g.tolerance, 0) then 'on_track' else 'off_track' end;
      note := format('Aim: %s, within %s.', g.target_value, coalesce(g.tolerance, 0));
    else -- threshold: reach at least the target.
      progress_status := case when actual >= g.target_value then 'target_met' else 'below_threshold' end;
      note := format('Aim: at least %s.', g.target_value);
  end case;

  if source = 'kpi_estimated' then
    note := concat_ws(' ', note, 'Based on an estimated measure.');
  end if;
  return next;
end $$;
grant execute on function plan.goal_progress(uuid) to authenticated;

-- Measures a goal can follow: those of the business's types.
create function plan.kpi_options(p_business_id uuid)
returns table (code text, name text, unit_kind text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'plan.view');
  return query
    select distinct on (d.code) d.code, d.name, d.unit_kind
      from business.businesses b
      join platform.industry_kpis ik on ik.industry_code = any (business.all_industries(b.industry_code, b.additional_industries))
      join platform.kpi_definitions d on d.code = ik.kpi_code
     where b.id = p_business_id
     order by d.code;
end $$;
grant execute on function plan.kpi_options(uuid) to authenticated;

------------------------------------------------------------------------------------------------
-- Access (section 10). Nothing is deleted except milestones and links; tasks and goals are
-- cancelled, so history stays.

select audit.enable_tracking('plan.goals');
select audit.enable_tracking('plan.goal_milestones');
select audit.enable_tracking('plan.tasks');
create trigger capture_change after insert or update or delete on plan.goal_progress
  for each row execute function audit.capture_change();
create trigger capture_change after insert or update or delete on plan.task_goals
  for each row execute function audit.capture_change();

alter table plan.goals enable row level security;
alter table plan.goal_progress enable row level security;
alter table plan.goal_milestones enable row level security;
alter table plan.tasks enable row level security;
alter table plan.task_goals enable row level security;

create policy goals_read on plan.goals for select to authenticated
  using (authz.has_business_permission(business_id, 'plan.view'));
create policy goals_insert on plan.goals for insert to authenticated
  with check (authz.has_business_permission(business_id, 'plan.goals'));
create policy goals_update on plan.goals for update to authenticated
  using (authz.has_business_permission(business_id, 'plan.goals'))
  with check (authz.has_business_permission(business_id, 'plan.goals'));

create policy goal_progress_read on plan.goal_progress for select to authenticated
  using (authz.has_business_permission(business_id, 'plan.view'));
create policy goal_progress_insert on plan.goal_progress for insert to authenticated
  with check (authz.has_business_permission(business_id, 'plan.goals'));

create policy goal_milestones_read on plan.goal_milestones for select to authenticated
  using (authz.has_business_permission(business_id, 'plan.view'));
create policy goal_milestones_insert on plan.goal_milestones for insert to authenticated
  with check (authz.has_business_permission(business_id, 'plan.goals'));
create policy goal_milestones_update on plan.goal_milestones for update to authenticated
  using (authz.has_business_permission(business_id, 'plan.goals'))
  with check (authz.has_business_permission(business_id, 'plan.goals'));
create policy goal_milestones_delete on plan.goal_milestones for delete to authenticated
  using (authz.has_business_permission(business_id, 'plan.goals'));

create policy tasks_read on plan.tasks for select to authenticated
  using (authz.has_business_permission(business_id, 'plan.view'));
create policy tasks_insert on plan.tasks for insert to authenticated
  with check (authz.has_business_permission(business_id, 'plan.tasks'));
create policy tasks_update on plan.tasks for update to authenticated
  using (authz.has_business_permission(business_id, 'plan.tasks'))
  with check (authz.has_business_permission(business_id, 'plan.tasks'));

create policy task_goals_read on plan.task_goals for select to authenticated
  using (authz.has_business_permission(business_id, 'plan.view'));
create policy task_goals_insert on plan.task_goals for insert to authenticated
  with check (authz.has_business_permission(business_id, 'plan.tasks'));
create policy task_goals_delete on plan.task_goals for delete to authenticated
  using (authz.has_business_permission(business_id, 'plan.tasks'));

grant select on plan.goals, plan.goal_progress, plan.goal_milestones, plan.tasks, plan.task_goals to authenticated;
grant insert (business_id, title, description, goal_type, direction, unit, baseline_value, target_value, tolerance,
              kpi_code, start_on, target_on, status, status_reason) on plan.goals to authenticated;
grant update (title, description, direction, unit, baseline_value, target_value, tolerance, kpi_code,
              start_on, target_on, status, status_reason) on plan.goals to authenticated;
grant insert (business_id, goal_id, recorded_on, actual_value, note) on plan.goal_progress to authenticated;
grant insert (business_id, goal_id, title, due_on, status, sort_order) on plan.goal_milestones to authenticated;
grant update (title, due_on, status, sort_order) on plan.goal_milestones to authenticated;
grant delete on plan.goal_milestones to authenticated;
grant insert (business_id, title, description, priority, status, due_on, completion_note, blocker_reason,
              assigned_to, client_id) on plan.tasks to authenticated;
grant update (title, description, priority, status, due_on, completion_note, blocker_reason, assigned_to)
  on plan.tasks to authenticated;
grant insert (task_id, goal_id, business_id), delete on plan.task_goals to authenticated;
