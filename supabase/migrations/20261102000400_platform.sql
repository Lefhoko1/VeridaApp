-- Module I: configuration that makes the platform universal. Adding an industry means
-- adding rows here, not new tables or application code (FR-I01 to FR-I08).

create table platform.industries (
  code        text primary key,
  name        text    not null,
  short_name  text    not null,
  description text    not null,
  icon        text    not null,
  chart_title text    not null,
  sort_order  int     not null default 0,
  is_active   boolean not null default true
);

create table platform.record_categories (
  id            uuid primary key default gen_random_uuid(),
  industry_code text not null references platform.industries (code) on delete cascade,
  kind          text not null check (kind in ('sale', 'expense')),
  name          text not null,
  sort_order    int  not null default 0,
  unique (industry_code, kind, name)
);

create table platform.activity_types (
  id              uuid primary key default gen_random_uuid(),
  industry_code   text    not null references platform.industries (code) on delete cascade,
  code            text    not null,
  name            text    not null,
  description     text    not null default '',
  default_unit    text    not null,
  uses_flock      boolean not null default false,
  allows_negative boolean not null default false,
  sort_order      int     not null default 0,
  unique (industry_code, code)
);

create table platform.kpi_definitions (
  code          text primary key,
  name          text not null,
  explanation   text not null,
  formula_text  text not null,
  required_data text not null,
  unit_kind     text not null check (unit_kind in ('money', 'count', 'percent', 'grams', 'quantity')),
  formula       text not null check (formula in ('revenue', 'expenses', 'recorded_balance', 'records_captured',
                                                 'activity_total', 'activity_latest', 'usable_eggs',
                                                 'hen_day_rate', 'feed_per_egg', 'expected_stock')),
  activity_code text
);

create table platform.industry_kpis (
  industry_code text    not null references platform.industries (code) on delete cascade,
  kpi_code      text    not null references platform.kpi_definitions (code) on delete cascade,
  sort_order    int     not null default 0,
  is_highlight  boolean not null default false,
  primary key (industry_code, kpi_code)
);

insert into platform.industries (code, name, short_name, description, icon, chart_title, sort_order) values
  ('poultry',      'Agriculture · Poultry', 'Farm',          'Farming and production',    'egg-outline',         'Production and farm activity',      1),
  ('retail',       'Retail · Tuckshop',     'Retail',        'Products, sales and stock', 'storefront-outline',  'Sales and stock activity',          2),
  ('salon',        'Beauty & services',     'Services',      'Appointments and services', 'content-cut',         'Customer and service activity',     3),
  ('food',         'Food & hospitality',    'Food business', 'Orders and ingredients',    'food-outline',        'Orders and food business activity', 4),
  ('professional', 'Professional services', 'Services',      'Projects and client work',  'briefcase-outline',   'Client and project activity',       5),
  ('other',        'Other business',        'Business',      'Start with the basics',     'plus-circle-outline', 'Business activity',                 6);

insert into platform.record_categories (industry_code, kind, name, sort_order) values
  ('poultry','sale','Egg sales',1), ('poultry','expense','Feed',1), ('poultry','expense','Medication',2),
  ('poultry','expense','Packaging',3), ('poultry','expense','Transport',4), ('poultry','expense','Other farm costs',5),
  ('retail','sale','Product sales',1), ('retail','expense','Stock purchases',1), ('retail','expense','Rent',2),
  ('retail','expense','Utilities',3), ('retail','expense','Transport',4), ('retail','expense','Other expenses',5),
  ('salon','sale','Service revenue',1), ('salon','sale','Product sales',2), ('salon','expense','Supplies',1),
  ('salon','expense','Rent',2), ('salon','expense','Utilities',3), ('salon','expense','Staff costs',4),
  ('salon','expense','Other expenses',5),
  ('food','sale','Food and drink sales',1), ('food','sale','Catering orders',2), ('food','expense','Ingredients',1),
  ('food','expense','Packaging',2), ('food','expense','Rent',3), ('food','expense','Utilities',4),
  ('food','expense','Delivery',5), ('food','expense','Other expenses',6),
  ('professional','sale','Project revenue',1), ('professional','sale','Consulting fees',2),
  ('professional','expense','Software',1), ('professional','expense','Travel',2), ('professional','expense','Contractors',3),
  ('professional','expense','Office costs',4), ('professional','expense','Other expenses',5),
  ('other','sale','Sales / revenue',1), ('other','expense','Operating expenses',1), ('other','expense','Purchases',2),
  ('other','expense','Other expenses',3);

insert into platform.activity_types
  (industry_code, code, name, description, default_unit, uses_flock, allows_negative, sort_order) values
  ('poultry','eggs_collected','Eggs collected','All eggs collected today, including any later rejected.','eggs',true,false,1),
  ('poultry','eggs_rejected','Broken or rejected eggs','Eggs that cannot be used or sold.','eggs',true,false,2),
  ('poultry','flock_count','Flock count','Number of birds present at the end of the day.','hens',true,false,3),
  ('poultry','feed_used','Feed used','Feed given to the flock. Record purchases separately as an expense.','kg',true,false,4),
  ('poultry','health_event','Health event','A vaccination, treatment or illness. Record medication costs as an expense.','event',true,false,5),
  ('retail','stock_received','Stock received','Items physically received from a supplier.','items',false,false,1),
  ('retail','stock_count','Stock count','Items counted on the shelf and in storage.','items',false,false,2),
  ('retail','stock_adjustment','Stock adjustment','A correction to stock. Use a negative number to reduce it.','items',false,true,3),
  ('retail','wastage','Wastage','Items expired, damaged or lost.','items',false,false,4),
  ('salon','appointments','Appointments','Appointments booked.','appointments',false,false,1),
  ('salon','customers_served','Customers served','Customers who received a service.','customers',false,false,2),
  ('salon','services_delivered','Services delivered','Individual services performed.','services',false,false,3),
  ('food','orders_completed','Orders completed','Orders fulfilled.','orders',false,false,1),
  ('food','meals_prepared','Meals prepared','Meals made.','meals',false,false,2),
  ('food','wastage','Wastage','Food thrown away.','portions',false,false,3),
  ('professional','projects_completed','Projects completed','Client projects finished.','projects',false,false,1),
  ('professional','client_meetings','Client meetings','Meetings held with clients.','meetings',false,false,2),
  ('professional','billable_hours','Billable hours','Hours spent on client work.','hours',false,false,3),
  ('other','business_activity','Business activity','Any important activity.','activities',false,false,1),
  ('other','units_delivered','Units delivered','Products or services delivered.','units',false,false,2),
  ('other','customers_served','Customers served','Customers served.','customers',false,false,3);

insert into platform.kpi_definitions (code, name, explanation, formula_text, required_data, unit_kind, formula, activity_code) values
  ('revenue', 'Revenue', 'Money earned from the sales you recorded in this period. It may not include all business income.', 'Sum of recorded sales totals', 'At least one sale', 'money', 'revenue', null),
  ('expenses', 'Recorded expenses', 'Costs you recorded in this period. Missing costs mean this may not be the full cost of running the business.', 'Sum of recorded expense amounts', 'At least one expense', 'money', 'expenses', null),
  ('recorded_balance', 'Recorded balance', 'Revenue minus recorded expenses. This is a simple balance, not verified net profit.', 'Revenue - recorded expenses', 'At least one sale and one expense', 'money', 'recorded_balance', null),
  ('records_captured', 'Records captured', 'How many records you added in this period.', 'Count of sales, expenses and activity records', 'None', 'count', 'records_captured', null),
  ('eggs_collected', 'Eggs collected', 'Total eggs collected in this period.', 'Sum of eggs collected', 'Egg collection records', 'count', 'activity_total', 'eggs_collected'),
  ('usable_eggs', 'Usable eggs', 'Eggs left after removing broken or rejected eggs.', 'Eggs collected - broken or rejected eggs', 'Egg collection records', 'count', 'usable_eggs', null),
  ('hen_day_rate', 'Hen-day laying rate', 'The share of present hens that laid each day. A production indicator, not a profit measure.', 'Eggs collected ÷ hens present × 100, on days with both records', 'Egg collection and flock count on the same days', 'percent', 'hen_day_rate', null),
  ('feed_per_egg', 'Feed per egg', 'How much feed was used for each egg collected.', 'Feed used in grams ÷ eggs collected, on days with both records', 'Feed use in kg and egg collection on the same days', 'grams', 'feed_per_egg', null),
  ('flock_size', 'Flock size', 'The most recent flock count in this period.', 'Latest flock count', 'A flock count', 'quantity', 'activity_latest', 'flock_count'),
  ('stock_received', 'Stock received', 'Items physically received in this period. This is not the same as stock purchased or sold.', 'Sum of stock received', 'Stock received records', 'quantity', 'activity_total', 'stock_received'),
  ('expected_stock', 'Expected stock', 'What should be on hand given your last count and the movements since then.', 'Latest count + received - sold + adjustments - wastage since that count', 'At least one stock count', 'quantity', 'expected_stock', null),
  ('wastage', 'Wastage', 'Items lost, expired or thrown away in this period.', 'Sum of wastage', 'Wastage records', 'quantity', 'activity_total', 'wastage'),
  ('customers_served', 'Customers served', 'Customers served in this period.', 'Sum of customers served', 'Customers served records', 'count', 'activity_total', 'customers_served'),
  ('appointments', 'Appointments', 'Appointments in this period.', 'Sum of appointments', 'Appointment records', 'count', 'activity_total', 'appointments'),
  ('services_delivered', 'Services delivered', 'Services performed in this period.', 'Sum of services delivered', 'Service records', 'count', 'activity_total', 'services_delivered'),
  ('orders_completed', 'Orders completed', 'Orders fulfilled in this period.', 'Sum of orders completed', 'Order records', 'count', 'activity_total', 'orders_completed'),
  ('meals_prepared', 'Meals prepared', 'Meals made in this period.', 'Sum of meals prepared', 'Meal records', 'count', 'activity_total', 'meals_prepared'),
  ('projects_completed', 'Projects completed', 'Client projects finished in this period.', 'Sum of projects completed', 'Project records', 'count', 'activity_total', 'projects_completed'),
  ('client_meetings', 'Client meetings', 'Client meetings in this period.', 'Sum of client meetings', 'Meeting records', 'count', 'activity_total', 'client_meetings'),
  ('billable_hours', 'Billable hours', 'Hours spent on client work in this period.', 'Sum of billable hours', 'Billable hour records', 'quantity', 'activity_total', 'billable_hours'),
  ('business_activity', 'Business activity', 'Activities recorded in this period.', 'Sum of activities', 'Activity records', 'count', 'activity_total', 'business_activity'),
  ('units_delivered', 'Units delivered', 'Units delivered in this period.', 'Sum of units delivered', 'Delivery records', 'quantity', 'activity_total', 'units_delivered');

-- Every industry shares the financial KPIs and adds its own (FR-E10, FR-E11).
insert into platform.industry_kpis (industry_code, kpi_code, sort_order, is_highlight)
select i.code, k.code, k.ord, k.highlight
  from platform.industries i
 cross join (values ('revenue', 1, true), ('expenses', 2, true),
                    ('recorded_balance', 3, false), ('records_captured', 4, false)) as k(code, ord, highlight);

insert into platform.industry_kpis (industry_code, kpi_code, sort_order, is_highlight) values
  ('poultry','hen_day_rate',10,true), ('poultry','eggs_collected',11,true), ('poultry','usable_eggs',12,false),
  ('poultry','feed_per_egg',13,false), ('poultry','flock_size',14,false),
  ('retail','expected_stock',10,true), ('retail','stock_received',11,true), ('retail','wastage',12,false),
  ('salon','customers_served',10,true), ('salon','appointments',11,true), ('salon','services_delivered',12,false),
  ('food','orders_completed',10,true), ('food','meals_prepared',11,true), ('food','wastage',12,false),
  ('professional','projects_completed',10,true), ('professional','billable_hours',11,true), ('professional','client_meetings',12,false),
  ('other','business_activity',10,true), ('other','units_delivered',11,true), ('other','customers_served',12,false);

do $$
declare
  t text;
begin
  foreach t in array array['industries','record_categories','activity_types','kpi_definitions','industry_kpis']
  loop
    execute format('alter table platform.%I enable row level security', t);
    execute format('grant select, insert, update, delete on platform.%I to authenticated', t);
    execute format('create policy %I on platform.%I for select to authenticated using (true)', t || '_read', t);
    execute format($p$create policy %I on platform.%I for all to authenticated
                      using ((select authz.has_platform_role('administrator')))
                      with check ((select authz.has_platform_role('administrator')))$p$, t || '_admin', t);
  end loop;
end $$;
