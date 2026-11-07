-- Module C: financial and catalogue records. Owns no KPI interpretation.
-- Sales and expenses are voided rather than deleted, so reports stay reproducible.

create table records.products (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references business.businesses (id) on delete cascade,
  kind          text not null default 'product' check (kind in ('product', 'service')),
  name          text not null check (length(trim(name)) between 1 and 120),
  category      text,
  description   text,
  unit          text not null,
  selling_price numeric(14, 2) not null check (selling_price >= 0),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  created_by    uuid references identity.profiles (id),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references identity.profiles (id),
  unique (id, business_id),
  unique (business_id, name)
);

create table records.sales_transactions (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references business.businesses (id) on delete cascade,
  occurred_on  date not null,
  product_id   uuid,
  item_name    text not null check (length(trim(item_name)) between 1 and 120),
  category     text not null,
  quantity     numeric(14, 3) not null check (quantity > 0),
  unit         text,
  unit_price   numeric(14, 2) not null check (unit_price >= 0),
  -- FR-C21: the total can only ever be quantity x unit price.
  total_amount numeric(16, 2) generated always as (round(quantity * unit_price, 2)) stored,
  notes        text,
  status       text not null default 'recorded' check (status in ('recorded', 'voided')),
  void_reason  text,
  voided_at    timestamptz,
  voided_by    uuid references identity.profiles (id),
  created_at   timestamptz not null default now(),
  created_by   uuid references identity.profiles (id),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references identity.profiles (id),
  -- The composite key stops a sale from referencing another business's product.
  foreign key (product_id, business_id) references records.products (id, business_id) on delete restrict
);
create index sales_business_date_idx on records.sales_transactions (business_id, occurred_on desc);

create table records.expenses (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references business.businesses (id) on delete cascade,
  occurred_on date not null,
  category    text not null,
  description text not null check (length(trim(description)) between 1 and 200),
  amount      numeric(14, 2) not null check (amount >= 0),
  quantity    numeric(14, 3) check (quantity is null or quantity >= 0),
  unit        text,
  -- FR-C30: separates firm costs from estimates and partial information.
  certainty   text not null default 'recorded' check (certainty in ('recorded', 'estimated', 'incomplete')),
  notes       text,
  status      text not null default 'recorded' check (status in ('recorded', 'voided')),
  void_reason text,
  voided_at   timestamptz,
  voided_by   uuid references identity.profiles (id),
  created_at  timestamptz not null default now(),
  created_by  uuid references identity.profiles (id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references identity.profiles (id)
);
create index expenses_business_date_idx on records.expenses (business_id, occurred_on desc);

-- FR-C29: categories a business adds on top of its industry defaults.
create table records.custom_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references business.businesses (id) on delete cascade,
  kind        text not null check (kind in ('sale', 'expense')),
  name        text not null check (length(trim(name)) between 1 and 60),
  created_at  timestamptz not null default now(),
  unique (business_id, kind, name)
);

select audit.enable_tracking('records.products');
select audit.enable_tracking('records.sales_transactions');
select audit.enable_tracking('records.expenses');

alter table records.products enable row level security;
alter table records.sales_transactions enable row level security;
alter table records.expenses enable row level security;
alter table records.custom_categories enable row level security;

create policy products_read on records.products for select to authenticated
  using (authz.has_business_permission(business_id, 'records.view'));
create policy products_insert on records.products for insert to authenticated
  with check (authz.has_business_permission(business_id, 'products.manage'));
create policy products_update on records.products for update to authenticated
  using (authz.has_business_permission(business_id, 'products.manage'))
  with check (authz.has_business_permission(business_id, 'products.manage'));
-- FR-C35: the foreign key refuses deletion once a sale references the product.
create policy products_delete on records.products for delete to authenticated
  using (authz.has_business_permission(business_id, 'products.manage'));

create policy sales_read on records.sales_transactions for select to authenticated
  using (authz.has_business_permission(business_id, 'records.view'));
create policy sales_insert on records.sales_transactions for insert to authenticated
  with check (authz.has_business_permission(business_id, 'records.create'));
create policy sales_update on records.sales_transactions for update to authenticated
  using (status = 'recorded' and authz.has_business_permission(business_id, 'records.edit'))
  with check (status = 'recorded' and authz.has_business_permission(business_id, 'records.edit'));

create policy expenses_read on records.expenses for select to authenticated
  using (authz.has_business_permission(business_id, 'records.view'));
create policy expenses_insert on records.expenses for insert to authenticated
  with check (authz.has_business_permission(business_id, 'records.create'));
create policy expenses_update on records.expenses for update to authenticated
  using (status = 'recorded' and authz.has_business_permission(business_id, 'records.edit'))
  with check (status = 'recorded' and authz.has_business_permission(business_id, 'records.edit'));

create policy custom_categories_read on records.custom_categories for select to authenticated
  using (authz.has_business_permission(business_id, 'records.view'));
create policy custom_categories_insert on records.custom_categories for insert to authenticated
  with check (authz.has_business_permission(business_id, 'records.create'));

grant select, delete on records.products to authenticated;
grant insert (business_id, kind, name, category, description, unit, selling_price, is_active)
  on records.products to authenticated;
grant update (kind, name, category, description, unit, selling_price, is_active)
  on records.products to authenticated;

-- There is deliberately no DELETE grant on sales or expenses, and no client write to status.
grant select on records.sales_transactions to authenticated;
grant insert (business_id, occurred_on, product_id, item_name, category, quantity, unit, unit_price, notes)
  on records.sales_transactions to authenticated;
grant update (occurred_on, product_id, item_name, category, quantity, unit, unit_price, notes)
  on records.sales_transactions to authenticated;

grant select on records.expenses to authenticated;
grant insert (business_id, occurred_on, category, description, amount, quantity, unit, certainty, notes)
  on records.expenses to authenticated;
grant update (occurred_on, category, description, amount, quantity, unit, certainty, notes)
  on records.expenses to authenticated;

grant select on records.custom_categories to authenticated;
grant insert (business_id, kind, name) on records.custom_categories to authenticated;

-- Industry defaults first, then the business's own additions.
create function records.list_categories(p_business_id uuid, p_kind text) returns setof text
language plpgsql stable set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'records.view');
  return query
    select name from (
      select c.name, c.sort_order, 0 as source
        from platform.record_categories c
        join business.businesses b on b.industry_code = c.industry_code
       where b.id = p_business_id and c.kind = p_kind
      union all
      select cc.name, 0, 1
        from records.custom_categories cc
       where cc.business_id = p_business_id and cc.kind = p_kind
    ) merged
    order by source, sort_order, name;
end $$;

-- FR-C19, FR-C27.
create function records.void_sale(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
begin
  select business_id into target from records.sales_transactions where id = p_id;
  perform authz.require_business_permission(target, 'records.void');
  update records.sales_transactions
     set status = 'voided', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
   where id = p_id and status = 'recorded';
  if not found then
    raise exception 'This sale has already been voided.' using errcode = 'P0001';
  end if;
end $$;

create function records.void_expense(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  target uuid;
begin
  select business_id into target from records.expenses where id = p_id;
  perform authz.require_business_permission(target, 'records.void');
  update records.expenses
     set status = 'voided', void_reason = p_reason, voided_at = now(), voided_by = auth.uid()
   where id = p_id and status = 'recorded';
  if not found then
    raise exception 'This expense has already been voided.' using errcode = 'P0001';
  end if;
end $$;

grant execute on all functions in schema records to authenticated;
