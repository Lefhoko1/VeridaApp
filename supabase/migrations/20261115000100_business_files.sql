-- Receipts, product photos and business logos.
--
-- Files live in one private storage bucket, under the business they belong to:
--   <business id>/receipts/<file>   evidence for a sale, expense or activity record
--   <business id>/products/<file>   a product or service photo
--   <business id>/logo/<file>       the business logo
-- Who may read or write a file follows the same business permissions as the data it belongs to,
-- so a file is never more visible than its record.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-files', 'business-files', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'])
on conflict (id) do nothing;

-- The business a stored file belongs to, or null for a name outside the layout above.
create function business.file_business_id(p_name text) returns uuid
language sql immutable set search_path = '' as $$
  select case
    when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/(receipts|products|logo)/[^/]+$'
    then split_part(p_name, '/', 1)::uuid
  end
$$;

-- Whether the signed-in user may add, replace or remove this file.
create function business.can_write_file(p_name text) returns boolean
language sql stable set search_path = '' as $$
  select case split_part(p_name, '/', 2)
    when 'receipts' then authz.has_business_permission(business.file_business_id(p_name), 'records.create')
                      or authz.has_business_permission(business.file_business_id(p_name), 'records.edit')
    when 'products' then authz.has_business_permission(business.file_business_id(p_name), 'products.manage')
    when 'logo'     then authz.has_business_permission(business.file_business_id(p_name), 'business.manage')
    else false
  end
$$;

revoke execute on function business.file_business_id(text) from public;
revoke execute on function business.can_write_file(text) from public;
grant execute on function business.file_business_id(text) to authenticated;
grant execute on function business.can_write_file(text) to authenticated;

create policy business_files_read on storage.objects for select to authenticated
  using (bucket_id = 'business-files'
         and authz.has_business_permission(business.file_business_id(name), 'records.view'));

create policy business_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'business-files' and business.can_write_file(name));

create policy business_files_update on storage.objects for update to authenticated
  using (bucket_id = 'business-files' and business.can_write_file(name))
  with check (bucket_id = 'business-files' and business.can_write_file(name));

-- Staff who erase a business remove its files first (FR-B13, section 5).
create policy business_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'business-files'
         and (business.can_write_file(name) or authz.has_platform_permission('deletions.process')));

-- Staff erasing a business need to list its files, so they can see them too.
create policy business_files_read_for_erasure on storage.objects for select to authenticated
  using (bucket_id = 'business-files' and authz.has_platform_permission('deletions.process'));

-- Whether every path is a file of this business in the given folder. A record may hold up to ten.
create function business.valid_file_paths(p_paths text[], p_business uuid, p_folder text) returns boolean
language sql immutable set search_path = '' as $$
  select cardinality(p_paths) <= 10
     and coalesce((select bool_and(split_part(path, '/', 1) = p_business::text
                                   and business.file_business_id(path) is not null
                                   and split_part(path, '/', 2) = p_folder)
                     from unnest(p_paths) as path), true)
$$;
revoke execute on function business.valid_file_paths(text[], uuid, text) from public;
grant execute on function business.valid_file_paths(text[], uuid, text) to authenticated;

-- Receipts and other evidence. A record may only point at files in its own business's receipts folder.
alter table records.sales_transactions add column receipt_paths text[] not null default '{}'
  check (business.valid_file_paths(receipt_paths, business_id, 'receipts'));
alter table records.expenses add column receipt_paths text[] not null default '{}'
  check (business.valid_file_paths(receipt_paths, business_id, 'receipts'));
alter table operations.activity_records add column receipt_paths text[] not null default '{}'
  check (business.valid_file_paths(receipt_paths, business_id, 'receipts'));
alter table records.products add column image_path text
  check (image_path is null or (split_part(image_path, '/', 1) = business_id::text
                                and business.file_business_id(image_path) is not null
                                and split_part(image_path, '/', 2) = 'products'));
alter table business.businesses add column logo_path text
  check (logo_path is null or (split_part(logo_path, '/', 1) = id::text
                               and business.file_business_id(logo_path) is not null
                               and split_part(logo_path, '/', 2) = 'logo'));

grant insert (receipt_paths), update (receipt_paths) on records.sales_transactions to authenticated;
grant insert (receipt_paths), update (receipt_paths) on records.expenses to authenticated;
grant insert (receipt_paths), update (receipt_paths) on operations.activity_records to authenticated;
grant insert (image_path), update (image_path) on records.products to authenticated;
grant update (logo_path) on business.businesses to authenticated;

-- Workspaces carry their logo, so the app can show it beside the business name.
drop function business.my_workspaces();

create function business.my_workspaces()
returns table (
  id uuid, name text, industry_code text, stage text, size text, country text, location text,
  currency text, main_goal text, record_keeping text, status text, my_role text,
  additional_industries text[], other_type text, logo_path text
)
language plpgsql stable security definer set search_path = '' as $$
begin
  return query
    select b.id, b.name, b.industry_code, b.stage, b.size, b.country, b.location, b.currency,
           b.main_goal, b.record_keeping, b.status, m.role, b.additional_industries, b.other_type, b.logo_path
      from business.memberships m
      join business.businesses b on b.id = m.business_id
     where m.user_id = auth.uid() and m.status = 'active' and b.status <> 'deletion_requested'
     order by b.name;
end $$;
revoke execute on function business.my_workspaces() from public;
grant execute on function business.my_workspaces() to authenticated;
