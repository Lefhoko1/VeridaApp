-- Module A: user profile and account lifecycle. Credentials stay in Supabase Auth.

create table identity.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text        not null check (length(trim(full_name)) between 1 and 120),
  email          text        not null,
  phone          text        check (phone is null or length(phone) <= 32),
  account_status text        not null default 'pending_verification'
                 check (account_status in ('pending_verification', 'active', 'suspended',
                                           'deactivated', 'deletion_requested')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index profiles_email_idx on identity.profiles (lower(email));
alter table identity.profiles enable row level security;

-- FR-A04, FR-A07: the profile follows the auth user, and verification activates it.
create function identity.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into identity.profiles (id, full_name, email, account_status)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    case when new.email_confirmed_at is null then 'pending_verification' else 'active' end
  );
  return new;
end $$;

create function identity.handle_auth_user_updated() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update identity.profiles p
     set email = new.email,
         updated_at = now(),
         account_status = case
           when new.email_confirmed_at is not null and p.account_status = 'pending_verification'
           then 'active' else p.account_status end
   where p.id = new.id;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function identity.handle_new_auth_user();
create trigger on_auth_user_updated after update of email, email_confirmed_at on auth.users
  for each row execute function identity.handle_auth_user_updated();

-- FR-A20: reactivation is deliberately administrative.
create function identity.deactivate_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update identity.profiles set account_status = 'deactivated', updated_at = now()
   where id = auth.uid() and account_status = 'active';
  if not found then
    raise exception 'Only an active account can be deactivated.' using errcode = 'P0001';
  end if;
end $$;

-- FR-A21: records the request; erasure happens under the retention policy.
create function identity.request_account_deletion() returns void
language plpgsql security definer set search_path = '' as $$
begin
  update identity.profiles set account_status = 'deletion_requested', updated_at = now()
   where id = auth.uid();
end $$;

grant select on identity.profiles to authenticated;
-- Column grants: account_status can never be changed directly by a client.
grant update (full_name, phone) on identity.profiles to authenticated;
grant execute on function identity.deactivate_account() to authenticated;
grant execute on function identity.request_account_deletion() to authenticated;

create policy profiles_select_own on identity.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_update_own on identity.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
