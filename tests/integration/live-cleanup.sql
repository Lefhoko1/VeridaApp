-- Removes what live-supabase.test.ts creates, and nothing else: only businesses named "LIVE TEST"
-- and what refers to them. Accounts, and anything else they hold, are left alone.
--
-- Sales and activity records go first because they RESTRICT deletion of the products and flocks
-- that a cascade from the business would otherwise try to remove.
do $$
declare
  test_businesses uuid[];
begin
  select coalesce(array_agg(id), '{}') into test_businesses from business.businesses where name like 'LIVE TEST%';

  delete from assistant.request_log where business_id = any (test_businesses);
  delete from records.sales_transactions where business_id = any (test_businesses);
  delete from operations.activity_records where business_id = any (test_businesses);
  delete from business.businesses where id = any (test_businesses);
  delete from audit.record_changes where business_id = any (test_businesses);

  delete from notifications.outbox where subject like '%LIVE TEST%' or body like '%LIVE TEST%';
  delete from notifications.notifications where title like '%LIVE TEST%' or body like '%LIVE TEST%';
end $$;
