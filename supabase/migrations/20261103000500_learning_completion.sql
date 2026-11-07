-- Module F: content versioning, learner-profile lifecycle, response correction, archiving,
-- and the functions that let an AI service draft lessons under the same review workflow.

alter table learning.content add column updated_at timestamptz not null default now();
alter table learning.lessons add column generation_context jsonb;
alter table learning.learner_profiles
  add column status text not null default 'active'
  check (status in ('active', 'deactivated', 'deletion_requested'));

alter table learning.lesson_reviews drop constraint lesson_reviews_decision_check;
alter table learning.lesson_reviews
  add constraint lesson_reviews_decision_check
  check (decision in ('approve', 'reject', 'request_changes', 'regenerate'));

-- FR-F12: content is archived rather than deleted, which keeps lesson history intact.
revoke delete on learning.content from authenticated;

-- A learner profile's status changes only through set_learner_profile_status.
revoke insert, update on learning.learner_profiles from authenticated;
grant insert (user_id, goals, topics, preferred_format, updated_at) on learning.learner_profiles to authenticated;
grant update (goals, topics, preferred_format, updated_at) on learning.learner_profiles to authenticated;

-- FR-F15: any change to what learners would read creates a new version.
create function learning.bump_content_version() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  if (new.title, new.intro, new.example, new.challenge, new.objective)
     is distinct from (old.title, old.intro, old.example, old.challenge, old.objective) then
    new.version := old.version + 1;
  else
    new.version := old.version;
  end if;
  return new;
end $$;

create trigger bump_content_version before update on learning.content
  for each row execute function learning.bump_content_version();
create trigger capture_change after insert or update or delete on learning.content
  for each row execute function audit.capture_change();

-- Section 5: deactivate a learner profile or ask for it to be deleted.
create function learning.set_learner_profile_status(p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('active', 'deactivated', 'deletion_requested') then
    raise exception 'Unsupported learner profile status.' using errcode = '23514';
  end if;
  insert into learning.learner_profiles (user_id, status) values (auth.uid(), p_status)
  on conflict (user_id) do update set status = excluded.status, updated_at = now();
end $$;

-- Section 5: a learner may correct their own response.
create function learning.correct_lesson_response(
  p_lesson_id uuid, p_answer text, p_rating int, p_feedback text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update learning.lesson_responses
     set answer = p_answer, feedback_rating = p_rating, feedback_text = p_feedback
   where lesson_id = p_lesson_id and learner_id = auth.uid();
  if not found then
    raise exception 'There is no response to correct for this lesson.' using errcode = 'P0002';
  end if;
end $$;

-- Section 5: only decided lessons can be archived, so nothing leaves the review queue this way.
create function learning.archive_lesson(p_lesson_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not learning.is_reviewer() then
    raise exception 'Only a learning reviewer can archive lessons.' using errcode = '42501';
  end if;
  update learning.lessons set status = 'archived', updated_at = now()
   where id = p_lesson_id and status in ('rejected', 'published', 'completed');
  if not found then
    raise exception 'Only a decided lesson can be archived.' using errcode = 'P0001';
  end if;
end $$;

-- Approved content this learner has not had, best match first (FR-F16 to FR-F18).
create function learning.candidate_content(p_learner uuid, p_business uuid, p_limit int)
returns setof learning.content
language plpgsql stable security definer set search_path = '' as $$
declare
  industry text;
  is_new   boolean;
  wanted   text[];
begin
  select b.industry_code into industry from business.businesses b where b.id = p_business;
  select lp.topics into wanted from learning.learner_profiles lp where lp.user_id = p_learner;

  is_new := not exists (select 1 from records.sales_transactions where business_id = p_business)
        and not exists (select 1 from records.expenses where business_id = p_business)
        and not exists (select 1 from operations.activity_records where business_id = p_business);

  return query
    select c.*
      from learning.content c
     where c.approval_status = 'approved'
       and (c.industry_code = industry or c.industry_code is null)
       and c.for_new_business = is_new
       and not exists (select 1 from learning.lessons l
                        where l.content_id = c.id and l.learner_id = p_learner and l.business_id = p_business)
     order by (exists (select 1 from unnest(coalesce(wanted, '{}')) t where c.topic ilike '%' || t || '%')) desc,
              (c.industry_code is null), c.created_at
     limit p_limit;
end $$;

create function learning.has_active_request(p_learner uuid, p_business uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from learning.lessons
                  where learner_id = p_learner and business_id = p_business
                    and (status = 'pending_review' or created_at > now() - interval '7 days'));
end $$;

-- Replaces the original: same contract, now preferring the learner's chosen topics (FR-F18).
create or replace function learning.request_weekly_lesson(p_business_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  context text;
  chosen  learning.content;
begin
  if not authz.is_business_member(p_business_id) then
    raise exception 'You are not a member of this business.' using errcode = '42501';
  end if;
  if learning.has_active_request(auth.uid(), p_business_id) then
    return;
  end if;

  select b.name || ' · ' || i.name into context
    from business.businesses b
    join platform.industries i on i.code = b.industry_code
   where b.id = p_business_id;

  select * into chosen from learning.candidate_content(auth.uid(), p_business_id, 1);
  if not found then
    return;
  end if;

  insert into learning.lessons
    (learner_id, business_id, content_id, business_context, objective, title, intro, example, challenge)
  values
    (auth.uid(), p_business_id, chosen.id, context, chosen.objective, chosen.title, chosen.intro,
     chosen.example, chosen.challenge);
end $$;

-- FR-F17, FR-F18: everything a generator may use, for the signed-in learner only.
create function learning.lesson_generation_context(p_business_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not authz.is_business_member(p_business_id) then
    raise exception 'You are not a member of this business.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'already_requested', learning.has_active_request(auth.uid(), p_business_id),
    'business', (select jsonb_build_object(
        'name', b.name, 'industry', i.name, 'stage', b.stage, 'size', b.size,
        'currency', b.currency, 'main_goal', b.main_goal, 'context', b.name || ' · ' || i.name)
      from business.businesses b join platform.industries i on i.code = b.industry_code
      where b.id = p_business_id),
    'learner', coalesce((select jsonb_build_object('goals', lp.goals, 'topics', lp.topics, 'preferred_format', lp.preferred_format)
                           from learning.learner_profiles lp where lp.user_id = auth.uid()),
                        '{"goals":[],"topics":[],"preferred_format":"reading"}'::jsonb),
    'completed_lessons', coalesce((select jsonb_agg(l.title) from learning.lessons l
                                    where l.learner_id = auth.uid() and l.business_id = p_business_id and l.status = 'completed'), '[]'::jsonb),
    'candidates', coalesce((select jsonb_agg(jsonb_build_object(
        'id', c.id, 'topic', c.topic, 'difficulty', c.difficulty, 'objective', c.objective, 'kpi_code', c.kpi_code,
        'title', c.title, 'intro', c.intro, 'example', c.example, 'challenge', c.challenge))
      from learning.candidate_content(auth.uid(), p_business_id, 5) c), '[]'::jsonb)
  ) into result;
  return result;
end $$;

-- FR-F21: AI drafts enter the same queue as any other. Callable only by the server-side service.
create function learning.store_generated_lesson(
  p_learner uuid, p_business uuid, p_content uuid, p_business_context text, p_objective text,
  p_title text, p_intro text, p_example text, p_challenge text, p_context jsonb
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  created uuid;
begin
  if not exists (select 1 from learning.content where id = p_content and approval_status = 'approved') then
    raise exception 'A lesson must be based on approved content.' using errcode = '23514';
  end if;
  insert into learning.lessons
    (learner_id, business_id, content_id, business_context, objective, title, intro, example, challenge, generated_by, generation_context)
  values
    (p_learner, p_business, p_content, p_business_context, p_objective, p_title, p_intro, p_example, p_challenge, 'ai', p_context)
  returning id into created;
  return created;
end $$;

-- FR-F29: what a regenerator needs. Only a reviewer can obtain it.
create function learning.lesson_regeneration_context(p_lesson_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if not learning.is_reviewer() then
    raise exception 'Only a learning reviewer can regenerate lessons.' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'lesson', jsonb_build_object('id', l.id, 'title', l.title, 'intro', l.intro, 'example', l.example,
                                 'challenge', l.challenge, 'objective', l.objective, 'status', l.status,
                                 'business_context', l.business_context),
    'source', jsonb_build_object('title', c.title, 'intro', c.intro, 'example', c.example, 'challenge', c.challenge, 'objective', c.objective),
    'generation_context', l.generation_context
  ) into result
    from learning.lessons l
    join learning.content c on c.id = l.content_id
   where l.id = p_lesson_id;
  if result is null then
    raise exception 'This lesson could not be found.' using errcode = 'P0002';
  end if;
  return result;
end $$;

-- Back in the queue with new text. Callable only by the server-side service.
create function learning.store_regenerated_lesson(
  p_lesson uuid, p_reviewer uuid, p_comments text, p_title text, p_intro text, p_example text, p_challenge text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update learning.lessons
     set title = p_title, intro = p_intro, example = p_example, challenge = p_challenge,
         generated_by = 'ai', status = 'pending_review', updated_at = now()
   where id = p_lesson and status in ('pending_review', 'changes_requested');
  if not found then
    raise exception 'This lesson has already been decided.' using errcode = 'P0001';
  end if;
  insert into learning.lesson_reviews (lesson_id, reviewer_id, decision, comments)
  values (p_lesson, p_reviewer, 'regenerate', p_comments);
end $$;

-- FR-F29 without an AI service: moves the draft to the next approved content.
create function learning.regenerate_from_content(p_lesson_id uuid, p_comments text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  lesson learning.lessons;
  chosen learning.content;
begin
  if not learning.is_reviewer() then
    raise exception 'Only a learning reviewer can regenerate lessons.' using errcode = '42501';
  end if;
  select * into lesson from learning.lessons where id = p_lesson_id and status in ('pending_review', 'changes_requested');
  if not found then
    raise exception 'This lesson has already been decided.' using errcode = 'P0001';
  end if;
  select * into chosen from learning.candidate_content(lesson.learner_id, lesson.business_id, 1);
  if not found then
    raise exception 'There is no other approved content for this learner. Edit the lesson instead.' using errcode = 'P0001';
  end if;

  update learning.lessons
     set content_id = chosen.id, objective = chosen.objective, title = chosen.title, intro = chosen.intro,
         example = chosen.example, challenge = chosen.challenge, generated_by = 'template',
         status = 'pending_review', updated_at = now()
   where id = p_lesson_id;
  insert into learning.lesson_reviews (lesson_id, reviewer_id, decision, comments)
  values (p_lesson_id, auth.uid(), 'regenerate', p_comments);
end $$;

grant execute on function learning.set_learner_profile_status(text) to authenticated;
grant execute on function learning.correct_lesson_response(uuid, text, int, text) to authenticated;
grant execute on function learning.archive_lesson(uuid) to authenticated;
grant execute on function learning.lesson_generation_context(uuid) to authenticated;
grant execute on function learning.lesson_regeneration_context(uuid) to authenticated;
grant execute on function learning.regenerate_from_content(uuid, text) to authenticated;
-- Deliberately not granted to clients: store_generated_lesson, store_regenerated_lesson,
-- candidate_content and has_active_request.
