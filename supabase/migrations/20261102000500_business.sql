-- Module B: businesses, membership and invitations. Owns no authentication and no records.

create table business.businesses (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (length(trim(name)) between 1 and 120),
  industry_code  text not null references platform.industries (code),
  stage          text not null,
  size           text not null,
  country        text not null,
  location       text,
  currency       text not null check (currency ~ '^[A-Z]{3}$'),
  main_goal      text,
  record_keeping text,
  status         text not null default 'active'
                 check (status in ('active', 'deactivated', 'suspended', 'deletion_requested')),
  created_at     timestamptz not null default now(),
  created_by     uuid references identity.profiles (id),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references identity.profiles (id)
);

create table business.memberships (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references business.businesses (id) on delete cascade,
  user_id     uuid not null references identity.profiles (id) on delete cascade,
  role        text not null references authz.business_roles (code),
  status      text not null default 'active' check (status in ('active', 'removed')),
  created_at  timestamptz not null default now(),
  created_by  uuid references identity.profiles (id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references identity.profiles (id),
  unique (business_id, user_id)
);
create index memberships_user_idx on business.memberships (user_id) where status = 'active';

create table business.invitations (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references business.businesses (id) on delete cascade,
  email        text not null check (position('@' in email) > 1),
  role         text not null references authz.business_roles (code) check (role <> 'owner'),
  status       text not null default 'pending'
               check (status in ('pending', 'accepted', 'declined', 'revoked')),
  invited_by   uuid references identity.profiles (id),
  expires_at   timestamptz not null default now() + interval '14 days',
  responded_at timestamptz,
  created_at   timestamptz not null default now()
);
create unique index invitations_one_pending_idx on business.invitations (business_id, lower(email))
  where status = 'pending';

select audit.enable_tracking('business.businesses');
select audit.enable_tracking('business.memberships');

alter table business.businesses enable row level security;
alter table business.memberships enable row level security;
alter table business.invitations enable row level security;

create policy businesses_read on business.businesses for select to authenticated
  using (authz.is_business_member(id) or (select authz.has_platform_role('administrator')));
create policy businesses_update on business.businesses for update to authenticated
  using (authz.has_business_permission(id, 'business.manage'))
  with check (authz.has_business_permission(id, 'business.manage'));

create policy memberships_read on business.memberships for select to authenticated
  using (user_id = (select auth.uid()) or authz.has_business_permission(business_id, 'members.view'));

create policy invitations_read on business.invitations for select to authenticated
  using (authz.has_business_permission(business_id, 'members.manage'));

grant select on business.businesses, business.memberships, business.invitations to authenticated;
-- Status moves only through the functions below.
grant update (name, industry_code, stage, size, country, location, currency, main_goal, record_keeping)
  on business.businesses to authenticated;

-- FR-B01 to FR-B06: the business and its owner membership are created atomically.
create function business.register_business(
  p_name text, p_industry_code text, p_stage text, p_size text, p_country text,
  p_location text, p_currency text, p_main_goal text, p_record_keeping text
) returns business.businesses
language plpgsql security definer set search_path = '' as $$
declare
  created business.businesses;
begin
  if not exists (select 1 from identity.profiles
                  where id = auth.uid() and account_status = 'active') then
    raise exception 'Verify your account before registering a business.' using errcode = '42501';
  end if;
  if not exists (select 1 from platform.industries where code = p_industry_code and is_active) then
    raise exception 'Choose a supported business type.' using errcode = '23514';
  end if;

  insert into business.businesses
    (name, industry_code, stage, size, country, location, currency, main_goal, record_keeping)
  values
    (trim(p_name), p_industry_code, p_stage, p_size, p_country, p_location, p_currency, p_main_goal, p_record_keeping)
  returning * into created;

  insert into business.memberships (business_id, user_id, role)
  values (created.id, auth.uid(), 'owner');

  return created;
end $$;

-- Each workspace the caller can open, with the caller's own role.
create function business.my_workspaces()
returns table (
  id uuid, name text, industry_code text, stage text, size text, country text, location text,
  currency text, main_goal text, record_keeping text, status text, my_role text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select b.id, b.name, b.industry_code, b.stage, b.size, b.country, b.location, b.currency,
           b.main_goal, b.record_keeping, b.status, m.role
      from business.memberships m
      join business.businesses b on b.id = m.business_id
     where m.user_id = auth.uid() and m.status = 'active' and b.status <> 'deletion_requested'
     order by b.name;
end $$;

-- FR-B12, FR-B13: only owners, and only through these transitions.
create function business.set_business_status(p_business_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_status not in ('active', 'deactivated', 'deletion_requested') then
    raise exception 'Unsupported business status.' using errcode = '23514';
  end if;
  if not exists (select 1 from business.memberships
                  where business_id = p_business_id and user_id = auth.uid()
                    and role = 'owner' and status = 'active') then
    raise exception 'Only the business owner can do this.' using errcode = '42501';
  end if;
  update business.businesses set status = p_status
   where id = p_business_id and status <> 'suspended';
  if not found then
    raise exception 'This business is suspended. Contact Verida support.' using errcode = 'P0001';
  end if;
end $$;

-- Profiles are private to their owner, so member names are published through this function.
create function business.list_members(p_business_id uuid)
returns table (user_id uuid, full_name text, email text, role text, joined_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'members.view');
  return query
    select m.user_id, p.full_name, p.email, m.role, m.created_at
      from business.memberships m
      join identity.profiles p on p.id = m.user_id
     where m.business_id = p_business_id and m.status = 'active'
     order by m.created_at;
end $$;

-- FR-B19, FR-B20.
create function business.invite_member(p_business_id uuid, p_email text, p_role text)
returns business.invitations
language plpgsql security definer set search_path = '' as $$
declare
  created business.invitations;
begin
  perform authz.require_business_permission(p_business_id, 'members.manage');
  if exists (select 1 from business.memberships m
               join identity.profiles p on p.id = m.user_id
              where m.business_id = p_business_id and m.status = 'active'
                and lower(p.email) = lower(trim(p_email))) then
    raise exception 'This person is already a member of the business.' using errcode = '23505';
  end if;

  insert into business.invitations (business_id, email, role, invited_by)
  values (p_business_id, lower(trim(p_email)), p_role, auth.uid())
  returning * into created;
  return created;
end $$;

create function business.revoke_invitation(p_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
begin
  select business_id into target from business.invitations where id = p_invitation_id;
  perform authz.require_business_permission(target, 'members.manage');
  update business.invitations set status = 'revoked', responded_at = now()
   where id = p_invitation_id and status = 'pending';
end $$;

-- Invitations addressed to the caller, including the business name they would join.
create function business.my_invitations()
returns table (id uuid, business_id uuid, business_name text, role text, expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select i.id, i.business_id, b.name, i.role, i.expires_at
      from business.invitations i
      join business.businesses b on b.id = i.business_id
      join identity.profiles p on p.id = auth.uid()
     where i.status = 'pending' and i.expires_at > now() and lower(i.email) = lower(p.email)
     order by i.created_at desc;
end $$;

-- FR-B24.
create function business.respond_to_invitation(p_invitation_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  invite business.invitations;
begin
  select i.* into invite
    from business.invitations i
    join identity.profiles p on p.id = auth.uid()
   where i.id = p_invitation_id and i.status = 'pending'
     and i.expires_at > now() and lower(i.email) = lower(p.email);
  if not found then
    raise exception 'This invitation is no longer available.' using errcode = 'P0002';
  end if;

  update business.invitations
     set status = case when p_accept then 'accepted' else 'declined' end, responded_at = now()
   where id = invite.id;

  if p_accept then
    insert into business.memberships (business_id, user_id, role)
    values (invite.business_id, auth.uid(), invite.role)
    on conflict (business_id, user_id) do update set role = excluded.role, status = 'active';
  end if;
end $$;

-- FR-B22, FR-B23. The owner role is never reassigned or removed here, so a business
-- cannot be left without an owner.
create function business.change_member_role(p_business_id uuid, p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'members.manage');
  if p_role = 'owner' then
    raise exception 'Ownership cannot be assigned here.' using errcode = '23514';
  end if;
  update business.memberships set role = p_role
   where business_id = p_business_id and user_id = p_user_id and status = 'active' and role <> 'owner';
  if not found then
    raise exception 'This member''s role cannot be changed.' using errcode = 'P0001';
  end if;
end $$;

create function business.remove_member(p_business_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'members.manage');
  update business.memberships set status = 'removed'
   where business_id = p_business_id and user_id = p_user_id and status = 'active' and role <> 'owner';
  if not found then
    raise exception 'This member cannot be removed.' using errcode = 'P0001';
  end if;
end $$;

grant execute on all functions in schema business to authenticated;
