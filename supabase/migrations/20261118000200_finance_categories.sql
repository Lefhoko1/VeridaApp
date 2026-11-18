-- Business Taxonomy & Configuration Catalogue v1.0, sections 3 and 4: universal sales and
-- expense categories shared by every business, with optional expense subcategories. They are
-- data that Verida staff with configuration.manage maintain from the staff screens.
--
-- A sale or expense still keeps the name the person chose in `category`, which may be one of
-- these, one of their business type's own categories, or one they typed. The database now also
-- stores which universal category that belongs to, in `category_code`, so every record can be
-- reported under the same classification whatever its business type.

create table platform.finance_categories (
  code        text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  kind        text    not null check (kind in ('sale', 'expense')),
  -- A subcategory names its category. Only one level is allowed.
  parent_code text references platform.finance_categories (code) on update cascade,
  name        text    not null check (length(trim(name)) between 1 and 80),
  description text    not null default '' check (char_length(description) <= 300),
  sort_order  int     not null default 0,
  is_active   boolean not null default true,
  unique (kind, name)
);
create index finance_categories_parent_idx on platform.finance_categories (parent_code, sort_order);

create function platform.check_finance_category() returns trigger
language plpgsql set search_path = '' as $$
declare
  parent platform.finance_categories;
begin
  if new.parent_code is null then
    if tg_op = 'UPDATE' and old.parent_code is null and new.kind <> old.kind
       and exists (select 1 from platform.finance_categories c where c.parent_code = new.code) then
      raise exception 'A category with subcategories cannot change between sales and expenses.' using errcode = '23514';
    end if;
    return new;
  end if;
  select * into parent from platform.finance_categories where code = new.parent_code;
  if parent.parent_code is not null then
    raise exception 'A subcategory must belong to a main category, not another subcategory.' using errcode = '23514';
  end if;
  if parent.kind <> new.kind then
    raise exception 'A subcategory must be the same kind as its category.' using errcode = '23514';
  end if;
  if exists (select 1 from platform.finance_categories c where c.parent_code = new.code) then
    raise exception 'A category with subcategories cannot become a subcategory.' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger check_finance_category before insert or update on platform.finance_categories
  for each row execute function platform.check_finance_category();

insert into platform.finance_categories (code, kind, name, description, sort_order) values
  ('product_sales',              'sale', 'Product sales',                    'Physical goods sold, such as eggs, groceries, clothing, furniture or manufactured goods.', 1),
  ('service_sales',              'sale', 'Service sales',                    'Haircuts, consulting, repairs, tutoring and other services.', 2),
  ('labour_project_charges',     'sale', 'Labour and project charges',       'Installation, construction work, contract labour and project-based work.', 3),
  ('food_beverage_sales',        'sale', 'Food and beverage sales',          'Meals, snacks, drinks, bakery products and catering orders.', 4),
  ('delivery_transport_charges', 'sale', 'Delivery and transport charges',   'Passenger fares, delivery fees, courier and freight charges.', 5),
  ('rental_hire_income',         'sale', 'Rental and hire income',           'Equipment, vehicles, rooms, tools or other assets rented to customers.', 6),
  ('subscription_income',        'sale', 'Subscription and recurring income', 'Memberships, retainers and recurring service plans.', 7),
  ('commission_income',          'sale', 'Commission and referral income',   'Sales commissions, referral fees and agency commissions.', 8),
  ('other_operating_sales',      'sale', 'Other operating sales',            'Other business income that does not fit the categories above.', 9),
  ('stock_materials',       'expense', 'Stock and materials',         'Goods for resale, raw materials, ingredients, packaging, consumables, feed and production inputs.', 1),
  ('employee_labour',       'expense', 'Employee and labour costs',   'Wages, salaries, casual labour, contractors, staff allowances and training.', 2),
  ('rent_premises',         'expense', 'Rent and premises',           'Rent, storage, security, cleaning and premises maintenance.', 3),
  ('utilities_comms',       'expense', 'Utilities and communications', 'Electricity, water, gas, internet, telephone and data bundles.', 4),
  ('transport_delivery',    'expense', 'Transport and delivery',      'Fuel, vehicle hire, public transport, courier, delivery and vehicle running costs.', 5),
  ('equipment_maintenance', 'expense', 'Equipment and maintenance',   'Repairs, servicing, tools, equipment maintenance and small equipment purchases.', 6),
  ('marketing_advertising', 'expense', 'Marketing and advertising',   'Online advertising, promotions, printing, signage, branding and sponsorship.', 7),
  ('administrative',        'expense', 'Administrative expenses',     'Stationery, office supplies, software subscriptions, bank administration and postage.', 8),
  ('professional_services', 'expense', 'Professional services',       'Accounting, legal, consulting, design and other professional fees.', 9),
  ('licences_fees',         'expense', 'Licences and business fees',  'Permits, registration fees, business licences and sector fees.', 10),
  ('finance_costs',         'expense', 'Finance costs',               'Bank charges, payment processing fees, interest and financing charges.', 11),
  ('other_expenses',        'expense', 'Other business expenses',     'Costs that do not fit any category above.', 12);

insert into platform.finance_categories (code, kind, parent_code, name, sort_order)
select s.code, 'expense', s.parent_code, s.name, s.sort_order
  from (values
    ('goods_for_resale',          'stock_materials', 'Goods for resale', 1),
    ('raw_materials',             'stock_materials', 'Raw materials', 2),
    ('ingredients',               'stock_materials', 'Ingredients', 3),
    ('packaging',                 'stock_materials', 'Packaging', 4),
    ('consumables',               'stock_materials', 'Consumables', 5),
    ('feed_production_inputs',    'stock_materials', 'Feed and production inputs', 6),
    ('wages',                     'employee_labour', 'Wages', 1),
    ('salaries',                  'employee_labour', 'Salaries', 2),
    ('casual_labour',             'employee_labour', 'Casual labour', 3),
    ('contractor_payments',       'employee_labour', 'Contractor payments', 4),
    ('staff_allowances',          'employee_labour', 'Staff allowances', 5),
    ('staff_training',            'employee_labour', 'Staff training', 6),
    ('shop_office_rent',          'rent_premises', 'Shop / office rent', 1),
    ('storage',                   'rent_premises', 'Storage', 2),
    ('security',                  'rent_premises', 'Security', 3),
    ('cleaning',                  'rent_premises', 'Cleaning', 4),
    ('premises_maintenance',      'rent_premises', 'Premises maintenance', 5),
    ('electricity',               'utilities_comms', 'Electricity', 1),
    ('water',                     'utilities_comms', 'Water', 2),
    ('gas',                       'utilities_comms', 'Gas', 3),
    ('internet',                  'utilities_comms', 'Internet', 4),
    ('telephone',                 'utilities_comms', 'Telephone', 5),
    ('data_bundles',              'utilities_comms', 'Data bundles', 6),
    ('fuel',                      'transport_delivery', 'Fuel', 1),
    ('vehicle_hire_cost',         'transport_delivery', 'Vehicle hire', 2),
    ('public_transport_cost',     'transport_delivery', 'Public transport', 3),
    ('courier_cost',              'transport_delivery', 'Courier', 4),
    ('delivery_cost',             'transport_delivery', 'Delivery', 5),
    ('vehicle_running_costs',     'transport_delivery', 'Vehicle operating costs', 6),
    ('repairs',                   'equipment_maintenance', 'Repairs', 1),
    ('servicing',                 'equipment_maintenance', 'Servicing', 2),
    ('tools',                     'equipment_maintenance', 'Tools', 3),
    ('equipment_upkeep',          'equipment_maintenance', 'Equipment maintenance', 4),
    ('small_equipment',           'equipment_maintenance', 'Small equipment purchases', 5),
    ('online_advertising',        'marketing_advertising', 'Online advertising', 1),
    ('promotions',                'marketing_advertising', 'Promotions', 2),
    ('printing_cost',             'marketing_advertising', 'Printing', 3),
    ('signage',                   'marketing_advertising', 'Signage', 4),
    ('branding',                  'marketing_advertising', 'Branding', 5),
    ('sponsorship',               'marketing_advertising', 'Sponsorship', 6),
    ('stationery',                'administrative', 'Stationery', 1),
    ('office_supplies',           'administrative', 'Office supplies', 2),
    ('software_subscriptions',    'administrative', 'Software subscriptions', 3),
    ('bank_administration',       'administrative', 'Bank administration', 4),
    ('postage',                   'administrative', 'Postage', 5),
    ('accounting_fees',           'professional_services', 'Accounting', 1),
    ('legal_fees',                'professional_services', 'Legal', 2),
    ('consulting_fees',           'professional_services', 'Consulting', 3),
    ('design_fees',               'professional_services', 'Design', 4),
    ('other_professional_fees',   'professional_services', 'Other professional fees', 5),
    ('permits',                   'licences_fees', 'Permits', 1),
    ('registration_fees',         'licences_fees', 'Registration fees', 2),
    ('business_licences',         'licences_fees', 'Business licences', 3),
    ('sector_fees',               'licences_fees', 'Sector-related fees', 4),
    ('bank_charges',              'finance_costs', 'Bank charges', 1),
    ('payment_processing_fees',   'finance_costs', 'Payment processing fees', 2),
    ('interest_financing',        'finance_costs', 'Interest and financing charges', 3)
  ) as s (code, parent_code, name, sort_order);

-- Each business type's own categories, such as Feed for poultry, belong to a universal one.
alter table platform.record_categories
  add column finance_category_code text references platform.finance_categories (code) on update cascade;

update platform.record_categories c
   set finance_category_code = m.finance_code
  from (values
    ('Egg sales', 'product_sales'), ('Product sales', 'product_sales'), ('Service revenue', 'service_sales'),
    ('Food and drink sales', 'food_beverage_sales'), ('Catering orders', 'food_beverage_sales'),
    ('Project revenue', 'labour_project_charges'), ('Consulting fees', 'service_sales'),
    ('Sales / revenue', 'other_operating_sales'),
    ('Feed', 'stock_materials'), ('Medication', 'stock_materials'), ('Packaging', 'stock_materials'),
    ('Stock purchases', 'stock_materials'), ('Supplies', 'stock_materials'), ('Ingredients', 'stock_materials'),
    ('Purchases', 'stock_materials'), ('Transport', 'transport_delivery'), ('Delivery', 'transport_delivery'),
    ('Travel', 'transport_delivery'), ('Rent', 'rent_premises'), ('Utilities', 'utilities_comms'),
    ('Staff costs', 'employee_labour'), ('Contractors', 'employee_labour'), ('Software', 'administrative'),
    ('Office costs', 'administrative'), ('Other farm costs', 'other_expenses'), ('Other expenses', 'other_expenses'),
    ('Operating expenses', 'other_expenses')
  ) as m (name, finance_code)
 where c.name = m.name;

create function platform.check_record_category_group() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.finance_category_code is not null
     and not exists (select 1 from platform.finance_categories f where f.code = new.finance_category_code and f.kind = new.kind) then
    raise exception 'Link a sales category to a sales group, and an expense category to an expense group.' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger check_record_category_group before insert or update of kind, finance_category_code on platform.record_categories
  for each row execute function platform.check_record_category_group();

-- The universal category a chosen name belongs to: a universal category or subcategory of that
-- name, then one of the business's own type categories, otherwise the catch-all. Names are
-- matched without regard to case, as the forms do.
create function records.universal_category(p_business_id uuid, p_kind text, p_name text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select coalesce(f.parent_code, f.code) from platform.finance_categories f
      where f.kind = p_kind and lower(f.name) = lower(trim(p_name))
      limit 1),
    (select coalesce(f.parent_code, f.code)
       from platform.record_categories c
       join business.businesses b on c.industry_code = any (business.all_industries(b.industry_code, b.additional_industries))
       join platform.finance_categories f on f.code = c.finance_category_code
      where b.id = p_business_id and c.kind = p_kind and lower(c.name) = lower(trim(p_name))
      order by array_position(business.all_industries(b.industry_code, b.additional_industries), c.industry_code)
      limit 1),
    case p_kind when 'sale' then 'other_operating_sales' else 'other_expenses' end
  );
$$;

alter table records.sales_transactions
  add column category_code text references platform.finance_categories (code) on update cascade;
alter table records.expenses
  add column category_code text references platform.finance_categories (code) on update cascade;

-- Clients have no grant on category_code, so only this trigger sets it.
create function records.classify_record() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.category is distinct from old.category then
    new.category_code := records.universal_category(new.business_id,
                           case tg_table_name when 'sales_transactions' then 'sale' else 'expense' end, new.category);
  end if;
  return new;
end $$;

create trigger classify_record before insert or update of category on records.sales_transactions
  for each row execute function records.classify_record();
create trigger classify_record before insert or update of category on records.expenses
  for each row execute function records.classify_record();

-- Back-fill without changing who last edited each record or adding an audit entry per row.
alter table records.sales_transactions disable trigger stamp_actor;
alter table records.sales_transactions disable trigger capture_change;
alter table records.expenses disable trigger stamp_actor;
alter table records.expenses disable trigger capture_change;

update records.sales_transactions set category_code = records.universal_category(business_id, 'sale', category);
update records.expenses set category_code = records.universal_category(business_id, 'expense', category);

alter table records.sales_transactions enable trigger stamp_actor;
alter table records.sales_transactions enable trigger capture_change;
alter table records.expenses enable trigger stamp_actor;
alter table records.expenses enable trigger capture_change;

alter table records.sales_transactions alter column category_code set not null;
alter table records.expenses alter column category_code set not null;
create index sales_category_code_idx on records.sales_transactions (business_id, category_code);
create index expenses_category_code_idx on records.expenses (business_id, category_code);

-- Every category a business can choose, with the universal group each one is reported under.
-- The business's own type categories and the ones it typed come first, as before, followed by
-- the universal categories, each with its subcategories. A name appears once.
create function records.category_options(p_business_id uuid, p_kind text)
returns table (name text, group_code text, group_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'records.view');
  return query
    with candidates as (
      select c.name, coalesce(f.parent_code, f.code) as grp, 0 as source,
             array_position(business.all_industries(b.industry_code, b.additional_industries), c.industry_code) as type_order,
             c.sort_order as pos
        from platform.record_categories c
        join business.businesses b on c.industry_code = any (business.all_industries(b.industry_code, b.additional_industries))
        left join platform.finance_categories f on f.code = c.finance_category_code and f.is_active
       where b.id = p_business_id and c.kind = p_kind
      union all
      select cc.name, null, 1, 0, 0
        from records.custom_categories cc
       where cc.business_id = p_business_id and cc.kind = p_kind
      union all
      select f.name, coalesce(f.parent_code, f.code), 2,
             coalesce(p.sort_order, f.sort_order), case when f.parent_code is null then 0 else f.sort_order end
        from platform.finance_categories f
        left join platform.finance_categories p on p.code = f.parent_code
       where f.kind = p_kind and f.is_active and (p.code is null or p.is_active)
    ),
    firsts as (
      select distinct on (lower(c.name)) c.name, c.grp, c.source, c.type_order, c.pos
        from candidates c
       order by lower(c.name), c.source, c.type_order, c.pos
    )
    select f.name, g.code, g.name
      from firsts f
      left join platform.finance_categories g on g.code = f.grp
     order by f.source, f.type_order, f.pos, f.name;
end $$;
grant execute on function records.category_options(uuid, text) to authenticated;

-- Kept for callers that need only the names, such as reading a receipt.
create or replace function records.list_categories(p_business_id uuid, p_kind text) returns setof text
language plpgsql stable set search_path = '' as $$
begin
  return query select o.name from records.category_options(p_business_id, p_kind) o;
end $$;

-- Same rules as the other configuration tables: everyone signed in reads, and only staff with
-- configuration.manage write. Changes are audited (FR-I11).
alter table platform.finance_categories enable row level security;
grant select, insert, update, delete on platform.finance_categories to authenticated;
create policy finance_categories_read on platform.finance_categories for select to authenticated using (true);
create policy finance_categories_admin on platform.finance_categories for all to authenticated
  using ((select authz.has_platform_permission('configuration.manage')))
  with check ((select authz.has_platform_permission('configuration.manage')));

create trigger capture_change after insert or update or delete on platform.finance_categories
  for each row execute function audit.capture_change();
