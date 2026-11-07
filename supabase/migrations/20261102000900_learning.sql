-- Module F: Verida Learn. Content, learner profiles, lessons, review and progress.
-- Owns no business-record calculations.

create table learning.learner_profiles (
  user_id          uuid primary key references identity.profiles (id) on delete cascade,
  goals            text[] not null default '{}',
  topics           text[] not null default '{}',
  preferred_format text not null default 'reading'
                   check (preferred_format in ('reading', 'practical', 'short_summary')),
  updated_at       timestamptz not null default now()
);

create table learning.content (
  id               uuid primary key default gen_random_uuid(),
  industry_code    text references platform.industries (code),
  topic            text not null,
  difficulty       text not null default 'beginner'
                   check (difficulty in ('beginner', 'intermediate', 'advanced')),
  objective        text not null,
  kpi_code         text references platform.kpi_definitions (code),
  title            text not null,
  intro            text not null,
  example          text not null,
  challenge        text not null,
  version          int  not null default 1,
  approval_status  text not null default 'draft' check (approval_status in ('draft', 'approved', 'archived')),
  for_new_business boolean not null default false,
  created_at       timestamptz not null default now()
);

create table learning.lessons (
  id           uuid primary key default gen_random_uuid(),
  learner_id   uuid not null references identity.profiles (id) on delete cascade,
  business_id  uuid not null references business.businesses (id) on delete cascade,
  content_id   uuid not null references learning.content (id),
  -- A snapshot of who the lesson is for. Reviewers need this context, but must not gain
  -- read access to the business itself.
  business_context text not null,
  objective    text not null,
  title        text not null check (length(trim(title)) > 0),
  intro        text not null check (length(trim(intro)) > 0),
  example      text not null check (length(trim(example)) > 0),
  challenge    text not null check (length(trim(challenge)) > 0),
  generated_by text not null default 'template' check (generated_by in ('template', 'ai')),
  status       text not null default 'pending_review'
               check (status in ('pending_review', 'changes_requested', 'rejected',
                                 'published', 'completed', 'archived')),
  published_at timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index lessons_review_queue_idx on learning.lessons (status, created_at);
create index lessons_learner_idx on learning.lessons (learner_id, business_id, created_at desc);

create table learning.lesson_reviews (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references learning.lessons (id) on delete cascade,
  reviewer_id uuid not null references identity.profiles (id),
  decision    text not null check (decision in ('approve', 'reject', 'request_changes')),
  comments    text,
  created_at  timestamptz not null default now()
);

create table learning.lesson_responses (
  id              uuid primary key default gen_random_uuid(),
  lesson_id       uuid not null unique references learning.lessons (id) on delete cascade,
  learner_id      uuid not null references identity.profiles (id) on delete cascade,
  answer          text,
  feedback_rating int check (feedback_rating between 1 and 5),
  feedback_text   text,
  created_at      timestamptz not null default now()
);

alter table learning.learner_profiles enable row level security;
alter table learning.content enable row level security;
alter table learning.lessons enable row level security;
alter table learning.lesson_reviews enable row level security;
alter table learning.lesson_responses enable row level security;

create function learning.is_reviewer() returns boolean
language plpgsql stable set search_path = '' as $$
begin
  return authz.has_platform_role('learning_reviewer') or authz.has_platform_role('administrator');
end $$;

create policy learner_profiles_own on learning.learner_profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy content_read on learning.content for select to authenticated
  using (approval_status = 'approved' or (select learning.is_reviewer()));
create policy content_admin on learning.content for all to authenticated
  using ((select authz.has_platform_role('administrator')))
  with check ((select authz.has_platform_role('administrator')));

-- FR-F22: a learner can never read a lesson before a reviewer has approved it.
create policy lessons_learner_read on learning.lessons for select to authenticated
  using (learner_id = (select auth.uid()) and status in ('published', 'completed'));
create policy lessons_reviewer_read on learning.lessons for select to authenticated
  using ((select learning.is_reviewer()));

create policy reviews_read on learning.lesson_reviews for select to authenticated
  using ((select learning.is_reviewer()));

create policy responses_read on learning.lesson_responses for select to authenticated
  using (learner_id = (select auth.uid()) or (select learning.is_reviewer()));

grant select, insert, update on learning.learner_profiles to authenticated;
grant select, insert, update, delete on learning.content to authenticated;
-- Lessons, reviews and responses change only through the functions below.
grant select on learning.lessons, learning.lesson_reviews, learning.lesson_responses to authenticated;

-- FR-F16 to FR-F21: creates this week's draft for review. Today it adapts approved content
-- deterministically; an AI generator can replace the selection and set generated_by = 'ai'.
create function learning.request_weekly_lesson(p_business_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  industry text;
  context  text;
  is_new   boolean;
  chosen   learning.content;
begin
  if not authz.is_business_member(p_business_id) then
    raise exception 'You are not a member of this business.' using errcode = '42501';
  end if;

  if exists (select 1 from learning.lessons
              where learner_id = auth.uid() and business_id = p_business_id
                and (status = 'pending_review' or created_at > now() - interval '7 days')) then
    return;
  end if;

  select b.industry_code, b.name || ' · ' || i.name into industry, context
    from business.businesses b
    join platform.industries i on i.code = b.industry_code
   where b.id = p_business_id;

  is_new := not exists (select 1 from records.sales_transactions where business_id = p_business_id)
        and not exists (select 1 from records.expenses where business_id = p_business_id)
        and not exists (select 1 from operations.activity_records where business_id = p_business_id);

  select c.* into chosen
    from learning.content c
   where c.approval_status = 'approved'
     and (c.industry_code = industry or c.industry_code is null)
     and c.for_new_business = is_new
     and not exists (select 1 from learning.lessons l
                      where l.content_id = c.id and l.learner_id = auth.uid()
                        and l.business_id = p_business_id)
   order by (c.industry_code is null), c.created_at
   limit 1;

  if not found then
    return;
  end if;

  insert into learning.lessons
    (learner_id, business_id, content_id, business_context, objective, title, intro, example, challenge)
  values
    (auth.uid(), p_business_id, chosen.id, context, chosen.objective, chosen.title, chosen.intro,
     chosen.example, chosen.challenge);
end $$;

-- The learner sees that a lesson is on its way, without seeing unreviewed content.
create function learning.weekly_lesson_state(p_business_id uuid)
returns table (lesson_id uuid, status text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select l.id, l.status, l.created_at
      from learning.lessons l
     where l.learner_id = auth.uid() and l.business_id = p_business_id
     order by l.created_at desc
     limit 1;
end $$;

-- FR-F26.
create function learning.edit_lesson(
  p_lesson_id uuid, p_title text, p_intro text, p_example text, p_challenge text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not learning.is_reviewer() then
    raise exception 'Only a learning reviewer can edit lessons.' using errcode = '42501';
  end if;
  update learning.lessons
     set title = p_title, intro = p_intro, example = p_example, challenge = p_challenge, updated_at = now()
   where id = p_lesson_id and status in ('pending_review', 'changes_requested');
  if not found then
    raise exception 'This lesson can no longer be edited.' using errcode = 'P0001';
  end if;
end $$;

-- FR-F27 to FR-F31: the only route to publication.
create function learning.review_lesson(p_lesson_id uuid, p_decision text, p_comments text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not learning.is_reviewer() then
    raise exception 'Only a learning reviewer can review lessons.' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject', 'request_changes') then
    raise exception 'Unsupported review decision.' using errcode = '23514';
  end if;

  update learning.lessons
     set status = case p_decision
                    when 'approve' then 'published'
                    when 'reject' then 'rejected'
                    else 'changes_requested' end,
         published_at = case when p_decision = 'approve' then now() end,
         updated_at = now()
   where id = p_lesson_id and status in ('pending_review', 'changes_requested');
  if not found then
    raise exception 'This lesson has already been decided.' using errcode = 'P0001';
  end if;

  insert into learning.lesson_reviews (lesson_id, reviewer_id, decision, comments)
  values (p_lesson_id, auth.uid(), p_decision, p_comments);
end $$;

-- FR-F35 to FR-F40.
create function learning.complete_lesson(
  p_lesson_id uuid, p_answer text, p_rating int, p_feedback text
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update learning.lessons set status = 'completed', completed_at = now(), updated_at = now()
   where id = p_lesson_id and learner_id = auth.uid() and status = 'published';
  if not found then
    raise exception 'This lesson is not available to complete.' using errcode = 'P0001';
  end if;
  insert into learning.lesson_responses (lesson_id, learner_id, answer, feedback_rating, feedback_text)
  values (p_lesson_id, auth.uid(), p_answer, p_rating, p_feedback);
end $$;

grant execute on all functions in schema learning to authenticated;

-- Approved launch content, one lesson per industry plus a starter for empty workspaces.
insert into learning.content (industry_code, topic, objective, kpi_code, title, intro, example, challenge, approval_status, for_new_business) values
  ('poultry', 'Production records', 'Interpret a laying rate from daily records', 'hen_day_rate',
   'Production records help you see patterns',
   'A daily production record helps you understand whether output is steady, improving or declining. One day is a snapshot; a series of records reveals a pattern.',
   'Example: if 60 hens produce 48 eggs in one day, the hen-day laying rate is 48 ÷ 60 × 100 = 80%. This is a production indicator, not a profit measure.',
   'Record the number of hens present and eggs collected each day for seven days. Then review the average laying rate.',
   'approved', false),
  ('retail', 'Profit basics', 'Separate sales from gross profit', 'revenue',
   'Sales are not the same as profit',
   'Sales show the money earned from selling products. You must also account for the cost of the goods sold and other expenses to understand what remains.',
   'Example: P1,000 in sales minus P650 cost of goods sold gives P350 gross profit, before rent, electricity and other expenses.',
   'Choose one best-selling product. Record its selling price and the price you paid to buy it.',
   'approved', false),
  ('salon', 'Service demand', 'Read demand from service records', 'customers_served',
   'Track the services that keep customers coming back',
   'Recording appointments and services helps you understand demand, busy periods and which services contribute to revenue.',
   'Example: if you serve 20 customers in a week and 12 book a particular service, that service represents 60% of customer visits.',
   'Record the number of customers served and the service provided each day this week.',
   'approved', false),
  ('food', 'Order costing', 'Understand the cost of one order', 'orders_completed',
   'Understand the cost behind every order',
   'Revenue from an order is only one part of performance. Ingredient, packaging and delivery costs affect what remains.',
   'Example: a P100 order with P42 in ingredients and P8 in packaging leaves P50 before labour, rent and other overheads.',
   'For one popular menu item, write down the ingredient quantities and approximate cost.',
   'approved', false),
  ('professional', 'Time and value', 'Relate delivery time to revenue', 'billable_hours',
   'Track the time behind your service revenue',
   'For service businesses, understanding the time spent on client work helps you assess workload and the value of your services.',
   'Example: a P2,000 project that takes 20 hours earns P100 per delivery hour before overheads and taxes.',
   'Record the hours spent on one client project and compare them with the fee earned.',
   'approved', false),
  (null, 'Record keeping', 'Build a consistent record-keeping habit', 'records_captured',
   'Build a habit of recording business activity',
   'Consistent records help you move from guessing to understanding. Start with the information that matters most to your business.',
   'Example: recording sales, expenses and the number of units delivered can help you see how activity relates to revenue and costs.',
   'Record one sale, one expense and one important business activity this week.',
   'approved', false),
  (null, 'Getting started', 'Capture a first business record', 'records_captured',
   'Start building a useful business record',
   'You are at the beginning of your Verida journey. A few consistent records will help you understand what is happening in your business.',
   'Start with one sale, one expense and one important daily activity. Verida will use these records to build a clearer picture over time.',
   'Capture one business record today. Then add another tomorrow.',
   'approved', true);
