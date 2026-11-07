-- FR-G21 to FR-G23: AI governance. Administrators see metadata and never conversation content.

alter table assistant.request_log
  add column source text not null default 'rules' check (source in ('rules', 'ai'));

grant insert (source) on assistant.request_log to authenticated;

-- Replacing the request log's business link would need a join on every read, so this names it.
create function assistant.admin_list_requests(
  p_outcome text default null, p_from date default null, p_to date default null, p_limit int default 100
)
returns table (
  id bigint, created_at timestamptz, intent text, outcome text, source text, latency_ms int,
  user_email text, business_name text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  return query
    select r.id, r.created_at, r.intent, r.outcome, r.source, r.latency_ms, p.email, b.name
      from assistant.request_log r
      left join identity.profiles p on p.id = r.user_id
      left join business.businesses b on b.id = r.business_id
     where (p_outcome is null or r.outcome = p_outcome)
       and (p_from is null or r.created_at::date >= p_from)
       and (p_to is null or r.created_at::date <= p_to)
     order by r.created_at desc
     limit least(greatest(p_limit, 1), 500);
end $$;

create function assistant.admin_usage(p_from date, p_to date)
returns table (
  requests bigint, answered bigint, insufficient_data bigint, failed bigint,
  from_ai bigint, from_rules bigint, average_latency_ms numeric
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  return query
    select count(*),
           count(*) filter (where r.outcome = 'answered'),
           count(*) filter (where r.outcome = 'insufficient_data'),
           count(*) filter (where r.outcome = 'failed'),
           count(*) filter (where r.source = 'ai'),
           count(*) filter (where r.source = 'rules'),
           round(avg(r.latency_ms), 0)
      from assistant.request_log r
     where r.created_at::date between p_from and p_to;
end $$;

-- Limits what one account can spend. Callable only by the server-side service.
create function assistant.ai_requests_last_hour(p_user uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from assistant.request_log
   where user_id = p_user and source = 'ai' and created_at > now() - interval '1 hour'
$$;

grant execute on function assistant.admin_list_requests(text, date, date, int) to authenticated;
grant execute on function assistant.admin_usage(date, date) to authenticated;
