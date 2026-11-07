-- Sales and activity records RESTRICT deletion of the products and flocks they refer to, and the
-- order cascades run in follows internal trigger names, which differ between databases. Removing
-- these records first means erasure works whatever that order turns out to be.
create or replace function business.admin_erase_business(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target business.businesses;
  member uuid;
begin
  perform authz.require_platform_permission('deletions.process');
  select * into target from business.businesses where id = p_id;
  if not found then
    raise exception 'This business could not be found.' using errcode = 'P0002';
  end if;
  if target.status <> 'deletion_requested' then
    raise exception 'Only a business with a deletion request can be erased.' using errcode = 'P0001';
  end if;
  perform platform.assert_retention_elapsed(target.deletion_requested_at);

  for member in select user_id from business.memberships where business_id = p_id and status = 'active' loop
    perform notifications.deliver(member, 'account', 'Business deleted',
      format('%s and its records have been permanently deleted.', target.name));
  end loop;

  delete from records.sales_transactions where business_id = p_id;
  delete from operations.activity_records where business_id = p_id;
  delete from business.businesses where id = p_id;

  -- Deleting the rows copied them into the audit log, which would defeat the purpose.
  delete from audit.record_changes where business_id = p_id;
  insert into audit.record_changes (table_schema, table_name, record_id, action, actor_id)
  values ('business', 'businesses', p_id, 'DELETE', auth.uid());
end $$;
