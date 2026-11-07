-- FR-F35, FR-F36, FR-F40: a lesson can have several activities, each answered on its own.
-- Section 5: deleting a lesson response, and assigning a lesson to a learner.

alter table learning.content add column activities text[] not null default '{}';

alter table learning.learner_profiles add column deletion_requested_at timestamptz;
update learning.learner_profiles set deletion_requested_at = updated_at where status = 'deletion_requested';

create function learning.stamp_deletion_request() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.status = 'deletion_requested' then
    new.deletion_requested_at := case when tg_op = 'UPDATE' then coalesce(old.deletion_requested_at, now()) else now() end;
  else
    new.deletion_requested_at := null;
  end if;
  return new;
end $$;

create trigger stamp_deletion_request before insert or update of status on learning.learner_profiles
  for each row execute function learning.stamp_deletion_request();

-- FR-F15: changing the activities also changes what learners would read.
create or replace function learning.bump_content_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if (new.title, new.intro, new.example, new.challenge, new.objective, new.activities)
     is distinct from (old.title, old.intro, old.example, old.challenge, old.objective, old.activities) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end $$;

create table learning.lesson_activities (
  id        uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references learning.lessons (id) on delete cascade,
  position  int  not null,
  prompt    text not null check (length(trim(prompt)) > 0),
  unique (lesson_id, position)
);

create table learning.activity_responses (
  activity_id uuid not null references learning.lesson_activities (id) on delete cascade,
  learner_id  uuid not null references identity.profiles (id) on delete cascade,
  answer      text not null check (length(trim(answer)) > 0),
  updated_at  timestamptz not null default now(),
  primary key (activity_id, learner_id)
);

alter table learning.lesson_activities enable row level security;
alter table learning.activity_responses enable row level security;

-- As with the lesson itself (FR-F22), a learner can't read activities before approval.
create policy lesson_activities_read on learning.lesson_activities for select to authenticated
  using ((select learning.is_reviewer())
         or exists (select 1 from learning.lessons l
                     where l.id = lesson_id and l.learner_id = (select auth.uid())
                       and l.status in ('published', 'completed')));
create policy activity_responses_read on learning.activity_responses for select to authenticated
  using (learner_id = (select auth.uid()) or (select learning.is_reviewer()));

grant select on learning.lesson_activities, learning.activity_responses to authenticated;

-- Every way of creating a lesson goes through these, so no generator needs to know about activities.
create function learning.seed_lesson_activities() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from learning.lesson_activities where lesson_id = new.id;
  insert into learning.lesson_activities (lesson_id, position, prompt)
  select new.id, a.position, a.prompt
    from learning.content c, unnest(c.activities) with ordinality as a (prompt, position)
   where c.id = new.content_id;
  return new;
end $$;

create trigger seed_lesson_activities after insert or update of content_id on learning.lessons
  for each row execute function learning.seed_lesson_activities();

-- FR-F26: a reviewer can change a lesson's activities along with its text.
create function learning.set_lesson_activities(p_lesson_id uuid, p_prompts text[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not learning.is_reviewer() then
    raise exception 'Only a learning reviewer can edit lessons.' using errcode = '42501';
  end if;
  if not exists (select 1 from learning.lessons
                  where id = p_lesson_id and status in ('pending_review', 'changes_requested')) then
    raise exception 'This lesson can no longer be edited.' using errcode = 'P0001';
  end if;
  delete from learning.lesson_activities where lesson_id = p_lesson_id;
  insert into learning.lesson_activities (lesson_id, position, prompt)
  select p_lesson_id, row_number() over (order by a.position), trim(a.prompt)
    from unnest(p_prompts) with ordinality as a (prompt, position)
   where length(trim(a.prompt)) > 0;
end $$;

-- FR-F35, FR-F36.
create function learning.submit_activity_response(p_activity_id uuid, p_answer text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from learning.lesson_activities a
                   join learning.lessons l on l.id = a.lesson_id
                  where a.id = p_activity_id and l.learner_id = auth.uid()
                    and l.status in ('published', 'completed')) then
    raise exception 'This activity is not available.' using errcode = 'P0002';
  end if;
  insert into learning.activity_responses (activity_id, learner_id, answer)
  values (p_activity_id, auth.uid(), p_answer)
  on conflict (activity_id, learner_id) do update set answer = excluded.answer, updated_at = now();
end $$;

-- Section 5. The lesson stays completed, because that part of the learner's history is still true.
-- What the learner wrote goes, and the audit log keeps only that a deletion happened and by whom.
create function learning.delete_lesson_response(p_lesson_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  removed  uuid;
begin
  select learner_id into owner_id from learning.lessons where id = p_lesson_id;
  if owner_id is null then
    raise exception 'This lesson could not be found.' using errcode = 'P0002';
  end if;
  if owner_id <> auth.uid() and not learning.is_reviewer() then
    raise exception 'You can only delete your own responses.' using errcode = '42501';
  end if;

  delete from learning.activity_responses r
   using learning.lesson_activities a
   where a.id = r.activity_id and a.lesson_id = p_lesson_id;
  delete from learning.lesson_responses where lesson_id = p_lesson_id returning id into removed;

  insert into audit.record_changes (table_schema, table_name, record_id, action, actor_id)
  values ('learning', 'lesson_responses', coalesce(removed, p_lesson_id), 'DELETE', auth.uid());
end $$;

-- The businesses a lesson could be assigned for. A lesson is always tied to one.
create function learning.admin_learner_workspaces(p_email text)
returns table (user_id uuid, full_name text, business_id uuid, business_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('content.manage');
  return query
    select p.id, p.full_name, b.id, b.name
      from identity.profiles p
      join business.memberships m on m.user_id = p.id and m.status = 'active'
      join business.businesses b on b.id = m.business_id and b.status = 'active'
     where lower(p.email) = lower(trim(p_email)) and p.account_status = 'active'
     order by b.name;
end $$;

-- Section 5, Lesson "Assign". It joins the same review queue as any other, so FR-F22 still holds.
create function learning.admin_assign_lesson(p_content_id uuid, p_learner uuid, p_business uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  chosen  learning.content;
  context text;
  created uuid;
begin
  perform authz.require_platform_permission('content.manage');
  select * into chosen from learning.content where id = p_content_id and approval_status = 'approved';
  if not found then
    raise exception 'Only approved content can be assigned.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from business.memberships
                  where business_id = p_business and user_id = p_learner and status = 'active') then
    raise exception 'This person is not a member of that business.' using errcode = 'P0001';
  end if;
  if exists (select 1 from learning.lessons
              where content_id = p_content_id and learner_id = p_learner and business_id = p_business
                and status <> 'archived') then
    raise exception 'This learner already has a lesson from this content.' using errcode = 'P0001';
  end if;

  select b.name || ' · ' || i.name into context
    from business.businesses b
    join platform.industries i on i.code = b.industry_code
   where b.id = p_business;

  insert into learning.lessons
    (learner_id, business_id, content_id, business_context, objective, title, intro, example, challenge)
  values
    (p_learner, p_business, chosen.id, context, chosen.objective, chosen.title, chosen.intro, chosen.example, chosen.challenge)
  returning id into created;
  return created;
end $$;

grant execute on function learning.set_lesson_activities(uuid, text[]) to authenticated;
grant execute on function learning.submit_activity_response(uuid, text) to authenticated;
grant execute on function learning.delete_lesson_response(uuid) to authenticated;
grant execute on function learning.admin_learner_workspaces(text) to authenticated;
grant execute on function learning.admin_assign_lesson(uuid, uuid, uuid) to authenticated;
