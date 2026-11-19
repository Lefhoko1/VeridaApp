-- Plan Module Developer Specification v1.0: the gaps left after the main build.
--   * Journey 5.3: a suggestion asked for from one insight remembers it, and a task accepted from
--     it links to the insight's measure.
--   * Section 8: goals, milestones and events captured offline are made once however often sent.
--   * Section 10 and open decision 6: files attached to tasks, as private as the task itself.

------------------------------------------------------------------------------------------------
-- Journey 5.3: suggestions from an insight.

alter table plan.recommendations
  add column insight_kpi   text references platform.kpi_definitions (code) on update cascade on delete set null,
  add column insight_title text check (char_length(insight_title) <= 160);

-- Replaced with an extra argument, for the insight a suggestion was asked about. Callers that do
-- not pass it, such as an AI service deployed before this migration, keep working.
drop function plan.store_recommendation(uuid, uuid, text, uuid, text, text, text, text, text, jsonb, date, date, text, text, jsonb);
drop function plan.suggest_from_rules(uuid, text, uuid, text);

create function plan.store_recommendation(
  p_business_id uuid, p_user_id uuid, p_kind text, p_goal_id uuid, p_request text,
  p_title text, p_explanation text, p_assumptions text, p_limitations text, p_sources jsonb,
  p_period_start date, p_period_end date, p_generator text, p_model text, p_actions jsonb,
  p_insight jsonb default null
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
                                    sources, period_start, period_end, generator, model, requested_by, insight_kpi, insight_title)
  values (p_business_id, p_kind, p_goal_id, nullif(trim(p_request), ''), trim(p_title), trim(p_explanation),
          nullif(trim(p_assumptions), ''), nullif(trim(p_limitations), ''), coalesce(p_sources, '[]'),
          p_period_start, p_period_end, p_generator, p_model, p_user_id,
          (select d.code from platform.kpi_definitions d where d.code = p_insight ->> 'kpi_code'),
          left(nullif(trim(p_insight ->> 'title'), ''), 160))
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

-- Replaces the version in 20261120000100: a task from an insight links to its measure.
create or replace function plan.accept_action(p_action_id uuid, p_edits jsonb default '{}') returns uuid
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
      -- Journey 5.3: a task from an insight stays linked to the measure it came from.
      if rec.insight_kpi is not null then
        insert into plan.task_links (business_id, task_id, link_type, kpi_code, label)
        values (a.business_id, made, 'kpi', rec.insight_kpi, coalesce(rec.insight_title, rec.insight_kpi))
        on conflict do nothing;
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

create function plan.suggest_from_rules(p_business_id uuid, p_kind text, p_goal_id uuid default null, p_request text default null, p_insight jsonb default null) returns uuid
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
  -- Journey 5.3: asked about one insight, the first step is to look into it.
  if p_insight is not null and nullif(trim(p_insight ->> 'title'), '') is not null then
    found_actions := jsonb_build_array(jsonb_build_object('type', 'create_task', 'why', format('From your insight: %s', left(p_insight ->> 'title', 200)),
      'payload', jsonb_build_object('title', left(format('Look into: %s', p_insight ->> 'title'), 160), 'due_on', today + 2))) || found_actions;
  end if;
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
    found_sources, today, today + 6, 'rules', null, found_actions, p_insight);
end $$;
grant execute on function plan.suggest_from_rules(uuid, text, uuid, text, jsonb) to authenticated;

------------------------------------------------------------------------------------------------
-- Section 8: goals, milestones and events captured offline. A client id makes a resent create
-- find the one already made. Events already have one.

alter table plan.goals add column client_id uuid unique;
alter table plan.goal_milestones add column client_id uuid unique;
grant insert (client_id) on plan.goals, plan.goal_milestones to authenticated;

------------------------------------------------------------------------------------------------
-- Files attached to tasks, under <business id>/plan/<file>. Anyone who can see the plan can see
-- them, and those who work on tasks add and remove them.

alter table plan.tasks
  add column attachment_paths text[] not null default '{}'
  check (business.valid_file_paths(attachment_paths, business_id, 'plan'));
grant update (attachment_paths) on plan.tasks to authenticated;

-- Replaces the versions in 20261115000100, adding the plan folder.
create or replace function business.file_business_id(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(receipts|products|logo|plan)/[^/]+$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

create or replace function business.can_write_file(p_name text) returns boolean
language sql stable set search_path = '' as $$
  select case split_part(p_name, '/', 2)
    when 'receipts' then authz.has_business_permission(business.file_business_id(p_name), 'records.create')
                      or authz.has_business_permission(business.file_business_id(p_name), 'records.edit')
    when 'products' then authz.has_business_permission(business.file_business_id(p_name), 'products.manage')
    when 'logo'     then authz.has_business_permission(business.file_business_id(p_name), 'business.manage')
    when 'plan'     then authz.has_business_permission(business.file_business_id(p_name), 'plan.tasks')
    else false
  end
$$;

-- A plan file is as visible as the plan, which a person may see without seeing the records.
drop policy business_files_read on storage.objects;
create policy business_files_read on storage.objects for select to authenticated
  using (bucket_id = 'business-files'
         and authz.has_business_permission(business.file_business_id(name),
               case split_part(name, '/', 2) when 'plan' then 'plan.view' else 'records.view' end));
