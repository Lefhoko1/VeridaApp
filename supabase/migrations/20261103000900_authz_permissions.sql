-- FR-B22: a business member's permissions can differ from their role's.
-- FR-I12: Verida's own staff get the same model, with permissions instead of one all-or-nothing role.

create table authz.member_permission_overrides (
  business_id uuid not null,
  user_id     uuid not null,
  permission  text not null references authz.permissions (code) on delete cascade,
  allowed     boolean not null,
  updated_by  uuid references identity.profiles (id),
  updated_at  timestamptz not null default now(),
  primary key (business_id, user_id, permission),
  foreign key (business_id, user_id) references business.memberships (business_id, user_id) on delete cascade
);
alter table authz.member_permission_overrides enable row level security;
create policy member_overrides_read on authz.member_permission_overrides for select to authenticated
  using (user_id = (select auth.uid()) or authz.has_business_permission(business_id, 'members.manage'));
grant select on authz.member_permission_overrides to authenticated;
create trigger capture_change after insert or update or delete on authz.member_permission_overrides
  for each row execute function audit.capture_change();

-- A personal override wins over the role. Every RLS policy goes through this function, so this
-- one change applies the new model everywhere.
create or replace function authz.has_business_permission(p_business_id uuid, p_permission text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1
      from business.memberships m
      join business.businesses b on b.id = m.business_id and b.status = 'active'
      join identity.profiles p   on p.id = m.user_id and p.account_status = 'active'
     where m.business_id = p_business_id and m.user_id = auth.uid() and m.status = 'active'
       and coalesce(
             (select o.allowed from authz.member_permission_overrides o
               where o.business_id = m.business_id and o.user_id = m.user_id and o.permission = p_permission),
             exists (select 1 from authz.role_permissions rp where rp.role = m.role and rp.permission = p_permission))
  );
end $$;

create or replace function authz.my_business_permissions(p_business_id uuid) returns setof text
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select c.code
      from business.memberships m
      join business.businesses b on b.id = m.business_id and b.status = 'active'
      cross join authz.permissions c
     where m.business_id = p_business_id and m.user_id = auth.uid() and m.status = 'active'
       and coalesce(
             (select o.allowed from authz.member_permission_overrides o
               where o.business_id = m.business_id and o.user_id = m.user_id and o.permission = c.code),
             exists (select 1 from authz.role_permissions rp where rp.role = m.role and rp.permission = c.code));
end $$;

-- Verida staff. A support role makes limited staff possible, since an administrator holds everything.
alter table authz.platform_role_assignments drop constraint platform_role_assignments_role_check;
alter table authz.platform_role_assignments
  add constraint platform_role_assignments_role_check
  check (role in ('administrator', 'learning_reviewer', 'support'));

create table authz.platform_permissions (
  code        text primary key,
  description text not null
);

create table authz.platform_role_permissions (
  role       text not null check (role in ('learning_reviewer', 'support')),
  permission text not null references authz.platform_permissions (code) on delete cascade,
  primary key (role, permission)
);

create table authz.platform_staff_overrides (
  user_id    uuid not null references identity.profiles (id) on delete cascade,
  permission text not null references authz.platform_permissions (code) on delete cascade,
  allowed    boolean not null,
  updated_by uuid references identity.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (user_id, permission)
);

insert into authz.platform_permissions (code, description) values
  ('users.manage',       'Search, edit and suspend user accounts'),
  ('businesses.manage',  'Search, configure and suspend businesses, and manage their teams'),
  ('configuration.manage', 'Change industries, categories, activities and KPIs'),
  ('content.manage',     'Create, edit, archive and assign learning content'),
  ('lessons.review',     'Review, edit, approve and reject lessons'),
  ('monitoring.view',    'See platform usage, availability and errors'),
  ('audit.view',         'Read the audit log'),
  ('ai_logs.view',       'See AI request details and performance'),
  ('deletions.process',  'Cancel deletion requests and erase data'),
  ('roles.manage',       'Manage staff roles and permissions');

insert into authz.platform_role_permissions (role, permission) values
  ('learning_reviewer', 'lessons.review'),
  ('support', 'users.manage'),
  ('support', 'businesses.manage'),
  ('support', 'monitoring.view'),
  ('support', 'ai_logs.view');

alter table authz.platform_permissions enable row level security;
alter table authz.platform_role_permissions enable row level security;
alter table authz.platform_staff_overrides enable row level security;

-- Administrators always hold everything, so the platform can always be managed.
create function authz.platform_permission_for(p_user uuid, p_permission text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  override boolean;
begin
  if not exists (select 1 from authz.platform_role_assignments a
                   join identity.profiles p on p.id = a.user_id
                  where a.user_id = p_user and p.account_status = 'active') then
    return false;
  end if;
  if exists (select 1 from authz.platform_role_assignments
              where user_id = p_user and role = 'administrator') then
    return true;
  end if;
  select o.allowed into override from authz.platform_staff_overrides o
   where o.user_id = p_user and o.permission = p_permission;
  if override is not null then
    return override;
  end if;
  return exists (select 1 from authz.platform_role_assignments a
                   join authz.platform_role_permissions rp on rp.role = a.role
                  where a.user_id = p_user and rp.permission = p_permission);
end $$;

create function authz.has_platform_permission(p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select authz.platform_permission_for(auth.uid(), p_permission)
$$;

create function authz.require_platform_permission(p_permission text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not authz.has_platform_permission(p_permission) then
    raise exception 'You do not have permission to do this on the Verida platform.' using errcode = '42501';
  end if;
end $$;

create function authz.my_platform_permissions() returns setof text
language sql stable security definer set search_path = '' as $$
  select c.code from authz.platform_permissions c where authz.platform_permission_for(auth.uid(), c.code)
$$;

-- Who should hear about something. Internal: used by notifications.
create function authz.staff_with_permission(p_permission text) returns setof uuid
language sql stable security definer set search_path = '' as $$
  select distinct a.user_id from authz.platform_role_assignments a
   where authz.platform_permission_for(a.user_id, p_permission)
$$;

create function authz.other_active_administrators(p_user uuid) returns bigint
language sql stable security definer set search_path = '' as $$
  select count(*) from authz.platform_role_assignments a
    join identity.profiles p on p.id = a.user_id
   where a.role = 'administrator' and a.user_id <> p_user and p.account_status = 'active'
$$;

-- Each administrative function now asks for the one permission it needs. Rewriting them here keeps
-- the mapping in one place. schema-invariants.test.mjs fails if any function still checks the role.
do $$
declare
  entry      record;
  definition text;
begin
  for entry in
    select * from (values
      ('identity', 'admin_search_users', 'users.manage'),
      ('identity', 'admin_get_user', 'users.manage'),
      ('business', 'admin_search_businesses', 'businesses.manage'),
      ('business', 'admin_get_business', 'businesses.manage'),
      ('business', 'admin_update_configuration', 'businesses.manage'),
      ('business', 'admin_set_status', 'businesses.manage'),
      ('authz', 'admin_list_platform_roles', 'roles.manage'),
      ('authz', 'admin_set_role_permission', 'roles.manage'),
      ('platform', 'admin_recent_events', 'monitoring.view'),
      ('platform', 'admin_usage_stats', 'monitoring.view'),
      ('platform', 'admin_audit_log', 'audit.view'),
      ('assistant', 'admin_list_requests', 'ai_logs.view'),
      ('assistant', 'admin_usage', 'ai_logs.view')
    ) as t (schema_name, function_name, permission)
  loop
    select pg_get_functiondef(p.oid) into strict definition
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = entry.schema_name and p.proname = entry.function_name;
    execute replace(definition, $q$authz.require_platform_role('administrator')$q$,
                    format('authz.require_platform_permission(%L)', entry.permission));
  end loop;
end $$;

-- Replacing the originals: only an administrator can create or remove an administrator, and the
-- count now ignores suspended accounts, which could not sign in to manage anything.
create or replace function authz.admin_grant_platform_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
begin
  perform authz.require_platform_permission('roles.manage');
  if p_role = 'administrator' and not authz.has_platform_role('administrator') then
    raise exception 'Only an administrator can make someone an administrator.' using errcode = '42501';
  end if;
  select id into target from identity.profiles where lower(email) = lower(trim(p_email));
  if target is null then
    raise exception 'No account uses this email address.' using errcode = 'P0002';
  end if;
  if target = auth.uid() then
    raise exception 'You cannot change your own roles.' using errcode = 'P0001';
  end if;
  insert into authz.platform_role_assignments (user_id, role, granted_by)
  values (target, p_role, auth.uid())
  on conflict (user_id, role) do nothing;
end $$;

create or replace function authz.admin_revoke_platform_role(p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('roles.manage');
  if p_role = 'administrator' then
    if not authz.has_platform_role('administrator') then
      raise exception 'Only an administrator can remove an administrator.' using errcode = '42501';
    end if;
    -- Without an administrator, only direct database access could restore this screen.
    if authz.other_active_administrators(p_user_id) = 0 then
      raise exception 'The platform must keep at least one administrator.' using errcode = 'P0001';
    end if;
  end if;
  delete from authz.platform_role_assignments where user_id = p_user_id and role = p_role;
  if not exists (select 1 from authz.platform_role_assignments where user_id = p_user_id) then
    delete from authz.platform_staff_overrides where user_id = p_user_id;
  end if;
end $$;

-- The matrix for staff roles. Administrators are not listed because they hold everything.
create function authz.admin_set_platform_role_permission(p_role text, p_permission text, p_allowed boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('roles.manage');
  if p_role = 'administrator' then
    raise exception 'The administrator role always has every permission.' using errcode = 'P0001';
  end if;
  if p_allowed then
    if not authz.has_platform_permission(p_permission) then
      raise exception 'You can only give out permissions you hold yourself.' using errcode = '42501';
    end if;
    insert into authz.platform_role_permissions (role, permission) values (p_role, p_permission)
    on conflict do nothing;
  else
    delete from authz.platform_role_permissions where role = p_role and permission = p_permission;
  end if;
end $$;

-- What one staff member can do and why, for the permissions screen.
create function authz.admin_staff_permissions(p_user_id uuid)
returns table (permission text, description text, from_role boolean, override boolean, allowed boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('roles.manage');
  return query
    select c.code, c.description,
           exists (select 1 from authz.platform_role_assignments a
                     join authz.platform_role_permissions rp on rp.role = a.role
                    where a.user_id = p_user_id and rp.permission = c.code),
           o.allowed,
           authz.platform_permission_for(p_user_id, c.code)
      from authz.platform_permissions c
      left join authz.platform_staff_overrides o on o.user_id = p_user_id and o.permission = c.code
     order by c.code;
end $$;

-- p_allowed null removes the override, returning the person to what their role gives them.
create function authz.admin_set_staff_permission(p_user_id uuid, p_permission text, p_allowed boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_platform_permission('roles.manage');
  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own permissions.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from authz.platform_role_assignments where user_id = p_user_id) then
    raise exception 'Give this person a platform role first.' using errcode = 'P0001';
  end if;
  if exists (select 1 from authz.platform_role_assignments where user_id = p_user_id and role = 'administrator') then
    raise exception 'An administrator always has every permission.' using errcode = 'P0001';
  end if;
  if p_allowed is null then
    delete from authz.platform_staff_overrides where user_id = p_user_id and permission = p_permission;
  else
    if p_allowed and not authz.has_platform_permission(p_permission) then
      raise exception 'You can only give out permissions you hold yourself.' using errcode = '42501';
    end if;
    insert into authz.platform_staff_overrides (user_id, permission, allowed, updated_by)
    values (p_user_id, p_permission, p_allowed, auth.uid())
    on conflict (user_id, permission) do update
      set allowed = excluded.allowed, updated_by = excluded.updated_by, updated_at = now();
  end if;
end $$;

grant select on authz.platform_permissions, authz.platform_role_permissions, authz.platform_staff_overrides to authenticated;
create policy platform_permissions_read on authz.platform_permissions for select to authenticated using (true);
create policy platform_role_permissions_read on authz.platform_role_permissions for select to authenticated using (true);
create policy platform_overrides_read on authz.platform_staff_overrides for select to authenticated
  using (user_id = (select auth.uid()) or (select authz.has_platform_permission('roles.manage')));

create trigger capture_change after insert or update or delete on authz.platform_role_permissions
  for each row execute function audit.capture_change();
create trigger capture_change after insert or update or delete on authz.platform_staff_overrides
  for each row execute function audit.capture_change();

grant execute on function authz.has_platform_permission(text) to authenticated;
grant execute on function authz.require_platform_permission(text) to authenticated;
grant execute on function authz.my_platform_permissions() to authenticated;
grant execute on function authz.admin_set_platform_role_permission(text, text, boolean) to authenticated;
grant execute on function authz.admin_staff_permissions(uuid) to authenticated;
grant execute on function authz.admin_set_staff_permission(uuid, text, boolean) to authenticated;
-- Deliberately not granted to clients: platform_permission_for, which answers for any user,
-- staff_with_permission and other_active_administrators.

-- Direct table access follows the same permissions as the functions.
do $$
declare
  t text;
begin
  foreach t in array array['industries','record_categories','activity_types','kpi_definitions','industry_kpis']
  loop
    execute format('drop policy %I on platform.%I', t || '_admin', t);
    execute format($p$create policy %I on platform.%I for all to authenticated
                      using ((select authz.has_platform_permission('configuration.manage')))
                      with check ((select authz.has_platform_permission('configuration.manage')))$p$, t || '_admin', t);
  end loop;
end $$;

drop policy businesses_read on business.businesses;
create policy businesses_read on business.businesses for select to authenticated
  using (authz.is_business_member(id) or (select authz.has_platform_permission('businesses.manage')));

drop policy content_admin on learning.content;
create policy content_admin on learning.content for all to authenticated
  using ((select authz.has_platform_permission('content.manage')))
  with check ((select authz.has_platform_permission('content.manage')));

create or replace function learning.is_reviewer() returns boolean
language plpgsql stable set search_path = '' as $$
begin
  return authz.has_platform_permission('lessons.review');
end $$;

drop policy request_log_admin_read on assistant.request_log;
create policy request_log_admin_read on assistant.request_log for select to authenticated
  using ((select authz.has_platform_permission('ai_logs.view')));

drop policy platform_roles_read on authz.platform_role_assignments;
create policy platform_roles_read on authz.platform_role_assignments for select to authenticated
  using (user_id = (select auth.uid()) or (select authz.has_platform_permission('roles.manage')));

drop policy record_changes_read on audit.record_changes;
create policy record_changes_read on audit.record_changes for select to authenticated
  using (authz.has_business_permission(business_id, 'audit.view')
         or (select authz.has_platform_permission('audit.view')));
