-- Authorisation service (section 3.1, FR-B25, FR-I13, FR-I14).
-- Every RLS policy in the other schemas goes through the functions in this file.

create table authz.platform_role_assignments (
  user_id    uuid not null references identity.profiles (id) on delete cascade,
  role       text not null check (role in ('administrator', 'learning_reviewer')),
  granted_by uuid references identity.profiles (id),
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table authz.business_roles (
  code        text primary key,
  name        text not null,
  description text not null
);

create table authz.permissions (
  code        text primary key,
  description text not null
);

create table authz.role_permissions (
  role       text not null references authz.business_roles (code) on delete cascade,
  permission text not null references authz.permissions (code) on delete cascade,
  primary key (role, permission)
);

insert into authz.business_roles (code, name, description) values
  ('owner',   'Owner',   'Owns the business and manages everything in it.'),
  ('manager', 'Manager', 'Runs daily operations, including products and corrections.'),
  ('staff',   'Staff',   'Captures and edits day-to-day records.'),
  ('viewer',  'Viewer',  'Reads records and performance without changing anything.');

insert into authz.permissions (code, description) values
  ('business.manage',  'Edit the business profile and configuration'),
  ('members.view',     'View business members'),
  ('members.manage',   'Invite, change and remove members'),
  ('records.view',     'View business records'),
  ('records.create',   'Capture business records'),
  ('records.edit',     'Edit business records'),
  ('records.void',     'Void business records'),
  ('products.manage',  'Create, change and remove products and services'),
  ('analytics.view',   'View dashboards, KPIs and insights'),
  ('audit.view',       'View the change history of this business');

-- Proposed MVP matrix: Appendix A of the requirements leaves this open for confirmation.
insert into authz.role_permissions (role, permission)
select 'owner', code from authz.permissions
union all
select 'manager', code from authz.permissions where code not in ('business.manage', 'members.manage', 'audit.view')
union all
select 'staff', code from authz.permissions
 where code in ('records.view', 'records.create', 'records.edit', 'analytics.view', 'members.view')
union all
select 'viewer', code from authz.permissions where code in ('records.view', 'analytics.view');

alter table authz.platform_role_assignments enable row level security;
alter table authz.business_roles enable row level security;
alter table authz.permissions enable row level security;
alter table authz.role_permissions enable row level security;

-- plpgsql resolves names at call time, so these may reference business.* created later.
create function authz.has_platform_role(p_role text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1
      from authz.platform_role_assignments a
      join identity.profiles p on p.id = a.user_id
     where a.user_id = auth.uid() and a.role = p_role and p.account_status = 'active'
  );
end $$;

-- True for any membership, even if the business is deactivated, so owners can still see it.
create function authz.is_business_member(p_business_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1
      from business.memberships m
      join identity.profiles p on p.id = m.user_id
     where m.business_id = p_business_id and m.user_id = auth.uid()
       and m.status = 'active' and p.account_status = 'active'
  );
end $$;

-- Operational access: suspended users and inactive businesses get nothing (FR-A26, FR-B18).
create function authz.has_business_permission(p_business_id uuid, p_permission text) returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  return exists (
    select 1
      from business.memberships m
      join business.businesses b     on b.id = m.business_id and b.status = 'active'
      join identity.profiles p       on p.id = m.user_id and p.account_status = 'active'
      join authz.role_permissions rp on rp.role = m.role and rp.permission = p_permission
     where m.business_id = p_business_id and m.user_id = auth.uid() and m.status = 'active'
  );
end $$;

create function authz.require_business_permission(p_business_id uuid, p_permission text) returns void
language plpgsql stable set search_path = '' as $$
begin
  if not authz.has_business_permission(p_business_id, p_permission) then
    raise exception 'You do not have permission to do this for this business.' using errcode = '42501';
  end if;
end $$;

create function authz.my_business_permissions(p_business_id uuid) returns setof text
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select rp.permission
      from business.memberships m
      join business.businesses b     on b.id = m.business_id and b.status = 'active'
      join authz.role_permissions rp on rp.role = m.role
     where m.business_id = p_business_id and m.user_id = auth.uid() and m.status = 'active';
end $$;

create function authz.my_platform_roles() returns setof text
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select a.role from authz.platform_role_assignments a where a.user_id = auth.uid();
end $$;

grant execute on all functions in schema authz to authenticated;
grant select on authz.business_roles, authz.permissions, authz.role_permissions to authenticated;
grant select on authz.platform_role_assignments to authenticated;

create policy business_roles_read on authz.business_roles for select to authenticated using (true);
create policy permissions_read on authz.permissions for select to authenticated using (true);
create policy role_permissions_read on authz.role_permissions for select to authenticated using (true);
create policy platform_roles_read on authz.platform_role_assignments for select to authenticated
  using (user_id = (select auth.uid()) or (select authz.has_platform_role('administrator')));

-- Audit visibility is decided here because it depends on the authorisation service.
grant select on audit.record_changes to authenticated;
create policy record_changes_read on audit.record_changes for select to authenticated
  using (authz.has_business_permission(business_id, 'audit.view')
         or (select authz.has_platform_role('administrator')));
