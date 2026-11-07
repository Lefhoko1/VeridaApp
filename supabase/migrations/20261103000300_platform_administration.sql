-- Module I: validation rules, monitoring and audit access.

-- FR-I07: an upper limit is now part of an activity's configurable validation rules.
alter table platform.activity_types
  add column max_quantity numeric check (max_quantity is null or max_quantity >= 0);

create or replace function operations.validate_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  config platform.activity_types;
begin
  select t.* into config
    from platform.activity_types t
    join business.businesses b on b.industry_code = t.industry_code
   where t.id = new.activity_type_id and b.id = new.business_id;
  if not found then
    raise exception 'This activity is not available for this type of business.' using errcode = '23514';
  end if;
  if new.quantity < 0 and not config.allows_negative then
    raise exception '% cannot be negative.', config.name using errcode = '23514';
  end if;
  if config.max_quantity is not null and new.quantity > config.max_quantity then
    raise exception '% cannot be more than %.', config.name, config.max_quantity using errcode = '23514';
  end if;
  return new;
end $$;

-- FR-I11: configuration changes are audited.
create trigger capture_change after insert or update or delete on platform.industries
  for each row execute function audit.capture_change();
create trigger capture_change after insert or update or delete on platform.record_categories
  for each row execute function audit.capture_change();
create trigger capture_change after insert or update or delete on platform.activity_types
  for each row execute function audit.capture_change();
create trigger capture_change after insert or update or delete on platform.kpi_definitions
  for each row execute function audit.capture_change();
create trigger capture_change after insert or update or delete on platform.industry_kpis
  for each row execute function audit.capture_change();

-- FR-I10: errors reported by the app and by server-side services.
create table platform.system_events (
  id         bigint generated always as identity primary key,
  source     text not null,
  severity   text not null check (severity in ('info', 'warning', 'error')),
  message    text not null,
  user_id    uuid,
  created_at timestamptz not null default now()
);
create index system_events_recent_idx on platform.system_events (created_at desc);
-- No policies and no client grants: written and read only through the functions below.
alter table platform.system_events enable row level security;

create function platform.report_event(p_source text, p_severity text, p_message text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into platform.system_events (source, severity, message, user_id)
  values (left(p_source, 80), p_severity, left(p_message, 1000), auth.uid());
end $$;

create function platform.admin_recent_events(p_limit int default 50)
returns table (id bigint, source text, severity text, message text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  return query
    select e.id, e.source, e.severity, e.message, e.created_at
      from platform.system_events e
     order by e.created_at desc
     limit least(greatest(p_limit, 1), 200);
end $$;

-- A round trip through the API and database, which the monitoring screen times.
create function platform.health_ping() returns timestamptz
language sql stable set search_path = '' as $$
  select now()
$$;

-- FR-I09. Counts only, with no personal or business detail.
create function platform.admin_usage_stats()
returns table (metric text, label text, value numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  since constant timestamptz := now() - interval '30 days';
begin
  perform authz.require_platform_role('administrator');
  return query
    select 'users_total'::text, 'Registered users'::text, count(*)::numeric from identity.profiles
    union all select 'users_active', 'Active users', count(*)::numeric from identity.profiles where account_status = 'active'
    union all select 'users_suspended', 'Suspended users', count(*)::numeric from identity.profiles where account_status = 'suspended'
    union all select 'users_new', 'New users, last 30 days', count(*)::numeric from identity.profiles where created_at >= since
    union all select 'businesses_total', 'Registered businesses', count(*)::numeric from business.businesses
    union all select 'businesses_active', 'Active businesses', count(*)::numeric from business.businesses where status = 'active'
    union all select 'sales_recent', 'Sales captured, last 30 days', count(*)::numeric from records.sales_transactions where created_at >= since
    union all select 'expenses_recent', 'Expenses captured, last 30 days', count(*)::numeric from records.expenses where created_at >= since
    union all select 'activity_recent', 'Activity records, last 30 days', count(*)::numeric from operations.activity_records where created_at >= since
    union all select 'lessons_pending', 'Lessons awaiting review', count(*)::numeric from learning.lessons where status = 'pending_review'
    union all select 'lessons_published', 'Lessons published, last 30 days', count(*)::numeric from learning.lessons where published_at >= since
    union all select 'ai_requests', 'Ask Verida requests, last 30 days', count(*)::numeric from assistant.request_log where created_at >= since
    union all select 'emails_pending', 'Emails waiting to send', count(*)::numeric from notifications.outbox where status in ('pending', 'sending')
    union all select 'emails_failed', 'Emails failed', count(*)::numeric from notifications.outbox where status = 'failed'
    union all select 'errors_recent', 'Errors, last 30 days', count(*)::numeric from platform.system_events where severity = 'error' and created_at >= since
    union all
    select 'industry:' || i.code, i.name, count(b.id)::numeric
      from platform.industries i
      left join business.businesses b on b.industry_code = i.code
     group by i.code, i.name, i.sort_order;
end $$;

-- FR-I11: names the fields that changed, without exposing their values on a list screen.
create function platform.admin_audit_log(
  p_table text default null, p_action text default null,
  p_from date default null, p_to date default null, p_limit int default 100
)
returns table (
  id bigint, occurred_at timestamptz, table_schema text, table_name text, action text,
  record_id uuid, business_id uuid, actor_email text, changed_fields text[]
)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_platform_role('administrator');
  return query
    select c.id, c.occurred_at, c.table_schema, c.table_name, c.action, c.record_id, c.business_id, p.email,
           coalesce((
             select array_agg(n.key order by n.key)
               from jsonb_each(coalesce(c.new_data, '{}'::jsonb)) n
              where n.key not in ('updated_at', 'updated_by', 'created_at', 'created_by')
                and n.value is distinct from coalesce(c.old_data, '{}'::jsonb) -> n.key
           ), '{}')
      from audit.record_changes c
      left join identity.profiles p on p.id = c.actor_id
     where (p_table is null or c.table_name = p_table)
       and (p_action is null or c.action = p_action)
       and (p_from is null or c.occurred_at::date >= p_from)
       and (p_to is null or c.occurred_at::date <= p_to)
     order by c.occurred_at desc, c.id desc
     limit least(greatest(p_limit, 1), 500);
end $$;

grant execute on function platform.report_event(text, text, text) to authenticated;
grant execute on function platform.admin_recent_events(int) to authenticated;
grant execute on function platform.health_ping() to authenticated;
grant execute on function platform.admin_usage_stats() to authenticated;
grant execute on function platform.admin_audit_log(text, text, date, date, int) to authenticated;
