-- Development only: gives an existing, verified account the two demo businesses from the
-- prototype, with about 45 days of realistic records. Never run this in production.
--
-- 1. Sign up in the app with the email address below (or change it).
-- 2. Run this whole file in the Supabase SQL editor.

do $$
declare
  owner_email constant text := 'demo@verida.test';
  owner_id uuid;
  farm uuid;
  shop uuid;
  day  date;
  n    int;
  poultry_type uuid;
  hens numeric;

  -- Looks up an activity type within an industry's configuration.
  eggs_type  uuid;
  flock_type uuid;
  feed_type  uuid;
  count_type uuid;
  recv_type  uuid;
begin
  select id into owner_id from identity.profiles where lower(email) = lower(owner_email);
  if owner_id is null then
    raise exception 'No account found for %. Sign up in the app first.', owner_email;
  end if;

  insert into business.businesses (name, industry_code, stage, size, country, location, currency, main_goal, record_keeping)
  values ('Vinabbie AgriSolutions', 'poultry', 'Already operating', 'Small-scale', 'Botswana', 'Gaborone', 'BWP',
          'Understand overall performance', 'Mostly manual records')
  returning id into farm;

  insert into business.businesses (name, industry_code, stage, size, country, location, currency, main_goal, record_keeping)
  values ('Tsholofelo Tuckshop', 'retail', 'Already operating', 'Small-scale', 'Botswana', 'Francistown', 'BWP',
          'Manage operations and inventory', 'Mostly manual records')
  returning id into shop;

  insert into business.memberships (business_id, user_id, role)
  values (farm, owner_id, 'owner'), (shop, owner_id, 'owner');

  select id into eggs_type  from platform.activity_types where industry_code = 'poultry' and code = 'eggs_collected';
  select id into flock_type from platform.activity_types where industry_code = 'poultry' and code = 'flock_count';
  select id into feed_type  from platform.activity_types where industry_code = 'poultry' and code = 'feed_used';
  select id into count_type from platform.activity_types where industry_code = 'retail'  and code = 'stock_count';
  select id into recv_type  from platform.activity_types where industry_code = 'retail'  and code = 'stock_received';

  for n in 0..44 loop
    day := current_date - n;

    -- The flock shrinks slightly over time, as in the prototype's data.
    hens := case when n < 7 then 58 when n < 14 then 59 else 60 end;
    insert into operations.activity_records (business_id, activity_type_id, occurred_on, quantity, unit) values
      (farm, eggs_type,  day, 45 + (n * 7) % 8, 'eggs'),
      (farm, flock_type, day, hens, 'hens'),
      (farm, feed_type,  day, 6.8 + ((n * 3) % 5) * 0.1, 'kg');

    if n % 2 = 0 then
      insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit, unit_price, notes)
      values (farm, day, 'Egg trays', 'Egg sales', 1.5 + ((n * 5) % 3) * 0.1, 'trays', 42, 'Sold at average P42 per tray');
    end if;
    if n % 7 = 1 then
      insert into records.expenses (business_id, occurred_on, category, description, amount, quantity, unit, notes)
      values (farm, day, 'Feed', 'Feed purchase', 980 + (n * 13) % 60, 150, 'kg', 'Purchase is not the same as feed consumed');
    end if;
    if n % 14 = 5 then
      insert into records.expenses (business_id, occurred_on, category, description, amount)
      values (farm, day, 'Medication', 'Routine flock health supplies', 185 + (n * 3) % 50);
    end if;

    insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit, unit_price, notes)
    values (shop, day, 'Counter sales', 'Product sales', 42 + (n * 11) % 27, 'items', 20, 'Daily counter sales');
    if n % 4 = 0 then
      insert into operations.activity_records (business_id, activity_type_id, occurred_on, quantity, unit)
      values (shop, recv_type, day, 135 + (n * 7) % 45, 'items');
      insert into records.expenses (business_id, occurred_on, category, description, amount, notes)
      values (shop, day, 'Stock purchases', 'Supplier replenishment', 1880 + (n * 17) % 570, 'Not cost of goods sold');
    end if;
    if n % 7 = 0 then
      insert into operations.activity_records (business_id, activity_type_id, occurred_on, quantity, unit)
      values (shop, count_type, day, 470 + (n * 3) % 80, 'items');
    end if;
    if n % 30 = 2 then
      insert into records.expenses (business_id, occurred_on, category, description, amount)
      values (shop, day, 'Rent', 'Monthly shop rent', 1200);
    end if;
  end loop;

  raise notice 'Demo data loaded for %.', owner_email;
end $$;
