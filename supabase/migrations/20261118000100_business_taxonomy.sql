-- Business Taxonomy & Configuration Catalogue v1.0, section 2: ten main categories, each with
-- selectable subcategories. A subcategory is what platform.industries already holds (the type a
-- business chooses, which brings its categories, activities and KPIs), so each industry now
-- belongs to a category. Both are data that Verida staff with configuration.manage can change
-- from the staff screens, and the app reads them rather than listing them in code.

create table platform.business_categories (
  code        text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  name        text    not null check (length(trim(name)) between 1 and 80),
  description text    not null default '' check (char_length(description) <= 200),
  icon        text    not null default 'storefront-outline',
  sort_order  int     not null default 0,
  is_active   boolean not null default true,
  unique (name)
);

insert into platform.business_categories (code, name, description, icon, sort_order) values
  ('agriculture',            'Agriculture & farming',               'Crops, animals and farm services',             'sprout-outline',     1),
  ('retail_wholesale',       'Retail & wholesale',                  'Shops, stock and distribution',                'storefront-outline', 2),
  ('beauty_personal',        'Beauty & personal services',          'Salons, treatments and personal care',         'content-cut',        3),
  ('food_hospitality',       'Food & hospitality',                  'Food, drinks and places to stay',              'food-outline',       4),
  ('professional_services',  'Professional & business services',    'Client work, advice and projects',             'briefcase-outline',  5),
  ('construction_trades',    'Construction & technical trades',     'Building, installation and repair work',       'hammer-wrench',      6),
  ('transport_logistics',    'Transport & logistics',               'Moving people and goods',                      'truck-outline',      7),
  ('manufacturing',          'Manufacturing & production',          'Making and processing products',               'factory',            8),
  ('education_health_care',  'Education, health & care',            'Teaching, wellbeing and care for people',      'school-outline',     9),
  ('digital_creative_other', 'Digital, creative & other businesses', 'Technology, media and everything else',        'laptop',            10);

alter table platform.industries
  add column category_code text references platform.business_categories (code) on update cascade;

-- The six original types become subcategories. Their codes stay the same, so every existing
-- business, record, activity type and KPI keeps working.
update platform.industries set category_code = 'agriculture', name = 'Poultry',
       description = 'Eggs, broilers and flock care', sort_order = 2 where code = 'poultry';
update platform.industries set category_code = 'retail_wholesale', name = 'Tuckshop / convenience shop',
       description = 'Everyday products, sales and stock', sort_order = 1 where code = 'retail';
update platform.industries set category_code = 'beauty_personal', name = 'Hair salon',
       description = 'Hair services and appointments', sort_order = 1 where code = 'salon';
update platform.industries set category_code = 'food_hospitality', name = 'Restaurant',
       description = 'Meals, orders and ingredients', sort_order = 1 where code = 'food';
update platform.industries set category_code = 'professional_services', name = 'Consulting',
       description = 'Advice, projects and client work', sort_order = 1 where code = 'professional';
update platform.industries set category_code = 'digital_creative_other', name = 'Other business',
       description = 'Describe your business in your own words', sort_order = 8 where code = 'other';

-- Any type an administrator added before this migration joins the catch-all category, where
-- they can move it.
update platform.industries set category_code = 'digital_creative_other' where category_code is null;

insert into platform.industries (code, category_code, name, description, short_name, chart_title, icon, sort_order)
select s.code, s.category_code, s.name, s.description, c.short_name, c.chart_title, cat.icon, s.sort_order
  from (values
    ('crop_farming',         'agriculture', 'Crop farming',                     'Field crops, planting and harvests',          1),
    ('livestock',            'agriculture', 'Livestock',                        'Cattle, goats, sheep and other animals',      3),
    ('horticulture',         'agriculture', 'Horticulture',                     'Vegetables, fruit, nurseries and orchards',   4),
    ('aquaculture',          'agriculture', 'Aquaculture',                      'Fish farming in ponds or tanks',              5),
    ('beekeeping',           'agriculture', 'Beekeeping',                       'Hives, honey and bee products',               6),
    ('agri_inputs',          'agriculture', 'Agricultural inputs and supplies', 'Seed, feed, fertiliser and farm supplies',    7),
    ('agri_services',        'agriculture', 'Agricultural services',            'Services carried out for farmers',            8),
    ('grocery',              'retail_wholesale', 'Grocery / supermarket',          'Food and household goods',              2),
    ('clothing_footwear',    'retail_wholesale', 'Clothing and footwear',          'Clothes, shoes and accessories',        3),
    ('hardware',             'retail_wholesale', 'Hardware and building supplies', 'Tools, materials and building goods',   4),
    ('electronics',          'retail_wholesale', 'Electronics and appliances',     'Devices, appliances and repairs',       5),
    ('pharmacy_retail',      'retail_wholesale', 'Pharmacy / health retail',       'Medicines and health products',         6),
    ('wholesale',            'retail_wholesale', 'Wholesale / distribution',       'Selling in bulk to other businesses',   7),
    ('online_retail',        'retail_wholesale', 'Online retail / e-commerce',     'Selling products online',               8),
    ('general_merchandise',  'retail_wholesale', 'General merchandise',            'A mix of everyday goods',               9),
    ('barbershop',           'beauty_personal', 'Barbershop',                       'Haircuts and grooming',                2),
    ('nail_studio',          'beauty_personal', 'Nail studio',                      'Manicures and pedicures',              3),
    ('spa_massage',          'beauty_personal', 'Spa / massage',                    'Treatments and relaxation',            4),
    ('skincare',             'beauty_personal', 'Beauty and skincare services',     'Skin treatments and beauty services',  5),
    ('makeup',               'beauty_personal', 'Makeup services',                  'Makeup for clients and events',        6),
    ('beauty_retail',        'beauty_personal', 'Beauty products retail',           'Selling beauty and care products',     7),
    ('personal_care',        'beauty_personal', 'Personal care services',           'Other personal care for clients',      8),
    ('cafe',                 'food_hospitality', 'Café / coffee shop',              'Coffee, drinks and light meals',       2),
    ('catering',             'food_hospitality', 'Catering',                        'Food prepared for clients',            3),
    ('bakery',               'food_hospitality', 'Bakery',                          'Bread, cakes and baked goods',         4),
    ('takeaway',             'food_hospitality', 'Food stall / takeaway',           'Quick meals to go',                    5),
    ('food_production',      'food_hospitality', 'Food production',                 'Food made in batches to sell',         6),
    ('bar',                  'food_hospitality', 'Bar / beverage service',          'Drinks served to customers',           7),
    ('guesthouse',           'food_hospitality', 'Guesthouse / lodge',              'Rooms and guest services',             8),
    ('accommodation',        'food_hospitality', 'Accommodation',                   'Rooms or units to stay in',            9),
    ('event_catering',       'food_hospitality', 'Event catering',                  'Food and service for events',         10),
    ('accounting',           'professional_services', 'Accounting / bookkeeping',      'Books, reconciliations and reports',   2),
    ('legal',                'professional_services', 'Legal services',                'Legal advice and matters',             3),
    ('marketing',            'professional_services', 'Marketing / advertising',       'Campaigns and promotion',              4),
    ('design_agency',        'professional_services', 'Design / creative agency',      'Design work for clients',              5),
    ('business_admin',       'professional_services', 'Business administration',       'Admin work for other businesses',      6),
    ('recruitment',          'professional_services', 'Recruitment / HR services',     'Finding and placing people',           7),
    ('freelance',            'professional_services', 'Freelance professional services', 'Independent client work',            8),
    ('real_estate',          'professional_services', 'Real estate services',          'Property listings, sales and rentals', 9),
    ('building_contractor',  'construction_trades', 'Building contractor',          'Building projects and sites',          1),
    ('plumbing',             'construction_trades', 'Plumbing',                     'Water, pipes and fittings',            2),
    ('electrical',           'construction_trades', 'Electrical services',          'Wiring, installation and repair',      3),
    ('carpentry',            'construction_trades', 'Carpentry / joinery',          'Woodwork and fitted furniture',        4),
    ('welding',              'construction_trades', 'Welding / fabrication',        'Metalwork made to order',              5),
    ('painting',             'construction_trades', 'Painting',                     'Painting and surface finishing',       6),
    ('tiling',               'construction_trades', 'Tiling',                       'Floors, walls and tiling work',        7),
    ('installation',         'construction_trades', 'Installation',                 'Installing equipment and systems',     8),
    ('repairs_maintenance',  'construction_trades', 'Repairs and maintenance',      'Fixing and servicing',                 9),
    ('landscaping',          'construction_trades', 'Landscaping',                  'Gardens, lawns and outdoor spaces',   10),
    ('taxi',                 'transport_logistics', 'Taxi / passenger transport',   'Trips for passengers',                 1),
    ('public_transport',     'transport_logistics', 'Public transport',             'Scheduled routes for passengers',      2),
    ('vehicle_hire',         'transport_logistics', 'Vehicle hire',                 'Renting out vehicles',                 3),
    ('courier',              'transport_logistics', 'Delivery / courier',           'Parcels and deliveries',               4),
    ('freight',              'transport_logistics', 'Trucking / freight',           'Moving loads by truck',                5),
    ('logistics',            'transport_logistics', 'Logistics coordination',       'Planning and tracking shipments',      6),
    ('warehousing',          'transport_logistics', 'Warehousing / storage',        'Storing goods for others',             7),
    ('moving',               'transport_logistics', 'Moving services',              'Helping people move home or office',   8),
    ('food_processing',      'manufacturing', 'Food processing',                    'Turning raw food into products',       1),
    ('textiles',             'manufacturing', 'Clothing / textiles',                'Making clothes and fabric goods',      2),
    ('furniture',            'manufacturing', 'Furniture',                          'Making furniture',                     3),
    ('crafts',               'manufacturing', 'Crafts / handmade products',         'Handmade goods',                       4),
    ('cosmetics_production', 'manufacturing', 'Cosmetics / personal care products', 'Making beauty and care products',      5),
    ('metal_wood',           'manufacturing', 'Metal / wood products',              'Products made from metal or wood',     6),
    ('packaging',            'manufacturing', 'Packaging',                          'Making packaging',                     7),
    ('printing',             'manufacturing', 'Printing',                           'Print jobs and finishing',             8),
    ('other_manufacturing',  'manufacturing', 'Other manufacturing',                'Other products you make',              9),
    ('tutoring',             'education_health_care', 'Tutoring',                        'Lessons for learners',                 1),
    ('training_provider',    'education_health_care', 'Training / education provider',   'Courses and training',                 2),
    ('childcare',            'education_health_care', 'Childcare',                       'Caring for children',                  3),
    ('wellness',             'education_health_care', 'Wellness services',               'Fitness and wellbeing sessions',       4),
    ('clinic',               'education_health_care', 'Clinic / healthcare provider',    'Health services for patients',         5),
    ('counselling',          'education_health_care', 'Therapy / counselling',           'Sessions with clients',                6),
    ('elder_care',           'education_health_care', 'Elder care',                      'Care for older people',                7),
    ('other_care',           'education_health_care', 'Other care services',             'Other care for people',                8),
    ('it_services',          'digital_creative_other', 'IT / software services',     'Software, support and IT projects',    1),
    ('digital_products',     'digital_creative_other', 'Digital products',           'Apps, courses and downloads',          2),
    ('digital_marketing',    'digital_creative_other', 'Digital marketing',          'Online campaigns and content',         3),
    ('media_production',     'digital_creative_other', 'Media / content production', 'Video, audio and written content',     4),
    ('photography',          'digital_creative_other', 'Photography / videography',  'Shoots and editing',                   5),
    ('entertainment',        'digital_creative_other', 'Entertainment',              'Events and performances',              6),
    ('online_services',      'digital_creative_other', 'Online services',            'Services delivered online',            7)
  ) as s (code, category_code, name, description, sort_order)
  join platform.business_categories cat on cat.code = s.category_code
  join (values
    ('agriculture',            'Farm',          'Farm activity'),
    ('retail_wholesale',       'Shop',          'Sales and stock activity'),
    ('beauty_personal',        'Services',      'Customer and service activity'),
    ('food_hospitality',       'Food business', 'Orders and guest activity'),
    ('professional_services',  'Services',      'Client and project activity'),
    ('construction_trades',    'Trade',         'Jobs and site activity'),
    ('transport_logistics',    'Transport',     'Trips and delivery activity'),
    ('manufacturing',          'Production',    'Production activity'),
    ('education_health_care',  'Services',      'Client and session activity'),
    ('digital_creative_other', 'Business',      'Business activity')
  ) as c (category_code, short_name, chart_title) on c.category_code = s.category_code;

alter table platform.industries alter column category_code set not null;
alter table platform.industries add constraint industries_category_name_key unique (category_code, name);
create index industries_category_idx on platform.industries (category_code, sort_order);

-- Every type shares the financial KPIs (FR-E10). New types get them automatically, so a type
-- added by an administrator starts with a working dashboard.
create function platform.add_shared_kpis() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into platform.industry_kpis (industry_code, kpi_code, sort_order, is_highlight)
  values (new.code, 'revenue', 1, true), (new.code, 'expenses', 2, true),
         (new.code, 'recorded_balance', 3, false), (new.code, 'records_captured', 4, false)
  on conflict do nothing;
  return new;
end $$;

create trigger add_shared_kpis after insert on platform.industries
  for each row execute function platform.add_shared_kpis();

insert into platform.industry_kpis (industry_code, kpi_code, sort_order, is_highlight)
select i.code, k.code, k.ord, k.highlight
  from platform.industries i
 cross join (values ('revenue', 1, true), ('expenses', 2, true),
                    ('recorded_balance', 3, false), ('records_captured', 4, false)) as k (code, ord, highlight)
on conflict do nothing;

-- A type can be chosen only while it and its category are both active.
create function platform.is_selectable_industry(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1
                   from platform.industries i
                   join platform.business_categories c on c.code = i.category_code
                  where i.code = p_code and i.is_active and c.is_active);
$$;
grant execute on function platform.is_selectable_industry(text) to authenticated;

-- Replaces the version in 20261104000100 so that the main type is checked as well as the
-- additional ones, wherever the change comes from. A type that has since been retired can stay
-- on a business that already has it.
create or replace function business.normalise_business_types() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  listed text[];
begin
  if (tg_op = 'INSERT' or new.industry_code is distinct from old.industry_code)
     and not platform.is_selectable_industry(new.industry_code) then
    raise exception 'Choose a supported business type.' using errcode = '23514';
  end if;

  select coalesce(array_agg(distinct_codes.wanted order by distinct_codes.first_seen), '{}') into listed
    from (select t.wanted, min(t.seen) as first_seen
            from unnest(new.additional_industries) with ordinality as t (wanted, seen)
           where t.wanted <> new.industry_code
           group by t.wanted) distinct_codes;
  if tg_op = 'INSERT' or new.additional_industries is distinct from old.additional_industries then
    if exists (select 1 from unnest(listed) as l (wanted)
                where not platform.is_selectable_industry(l.wanted)
                  and (tg_op = 'INSERT' or l.wanted <> all (old.additional_industries))) then
      raise exception 'Choose a supported business type.' using errcode = '23514';
    end if;
  end if;
  new.additional_industries := listed;
  new.other_type := nullif(trim(new.other_type), '');
  return new;
end $$;

-- Same rules as the other configuration tables: everyone signed in reads, and only staff with
-- configuration.manage write. Changes are audited (FR-I11).
alter table platform.business_categories enable row level security;
grant select, insert, update, delete on platform.business_categories to authenticated;
create policy business_categories_read on platform.business_categories for select to authenticated using (true);
create policy business_categories_admin on platform.business_categories for all to authenticated
  using ((select authz.has_platform_permission('configuration.manage')))
  with check ((select authz.has_platform_permission('configuration.manage')));

create trigger capture_change after insert or update or delete on platform.business_categories
  for each row execute function audit.capture_change();
