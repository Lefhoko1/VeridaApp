-- Module G: Ask Verida. Stores conversations and request metadata only. It is never the
-- source of truth for financial or operational figures (section 3.1).

create table assistant.conversations (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references identity.profiles (id) on delete cascade,
  business_id uuid not null references business.businesses (id) on delete cascade,
  title       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index conversations_user_idx on assistant.conversations (user_id, business_id, updated_at desc);

create table assistant.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references assistant.conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null check (length(content) between 1 and 8000),
  -- FR-G13: how far the answer can be relied on.
  confidence      text check (confidence in ('verified', 'estimate', 'guidance', 'insufficient_data')),
  created_at      timestamptz not null default now()
);
create index messages_conversation_idx on assistant.messages (conversation_id, created_at);

-- FR-G23: metadata only. The content of a question is deliberately not stored here, so
-- administrators can support the service without reading conversations (Appendix A default).
create table assistant.request_log (
  id          bigint generated always as identity primary key,
  user_id     uuid references identity.profiles (id) on delete set null,
  business_id uuid references business.businesses (id) on delete set null,
  intent      text not null,
  outcome     text not null check (outcome in ('answered', 'insufficient_data', 'failed')),
  latency_ms  int,
  created_at  timestamptz not null default now()
);

alter table assistant.conversations enable row level security;
alter table assistant.messages enable row level security;
alter table assistant.request_log enable row level security;

-- FR-I14: a conversation stays reachable only while its owner still belongs to the business.
create policy conversations_own on assistant.conversations for all to authenticated
  using (user_id = (select auth.uid()) and authz.is_business_member(business_id))
  with check (user_id = (select auth.uid()) and authz.is_business_member(business_id));

create function assistant.owns_conversation(p_conversation_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (select 1 from assistant.conversations c
                  where c.id = p_conversation_id and c.user_id = auth.uid()
                    and authz.is_business_member(c.business_id));
end $$;

create policy messages_read on assistant.messages for select to authenticated
  using (assistant.owns_conversation(conversation_id));
create policy messages_insert on assistant.messages for insert to authenticated
  with check (assistant.owns_conversation(conversation_id));

create policy request_log_insert on assistant.request_log for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy request_log_admin_read on assistant.request_log for select to authenticated
  using ((select authz.has_platform_role('administrator')));

grant select, delete on assistant.conversations to authenticated;
grant insert (user_id, business_id, title) on assistant.conversations to authenticated;
grant update (title, updated_at) on assistant.conversations to authenticated;
grant select on assistant.messages to authenticated;
grant insert (conversation_id, role, content, confidence) on assistant.messages to authenticated;
grant select on assistant.request_log to authenticated;
grant insert (user_id, business_id, intent, outcome, latency_ms) on assistant.request_log to authenticated;
grant execute on function assistant.owns_conversation(uuid) to authenticated;
