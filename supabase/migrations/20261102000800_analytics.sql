-- Module E: deterministic calculations. This schema owns no tables: it derives everything
-- from validated source records, so the client and AI services read one source of truth.
-- Functions run as the caller, so row-level security still applies to every source row.

-- Sum of one activity in a period, or null when there is nothing recorded.
create function analytics.activity_total(p_business uuid, p_from date, p_to date, p_code text) returns numeric
language sql stable set search_path = '' as $$
  select sum(r.quantity)
    from operations.activity_records r
    join platform.activity_types t on t.id = r.activity_type_id
   where r.business_id = p_business and r.status = 'recorded' and t.code = p_code
     and r.occurred_on between p_from and p_to
$$;

-- FR-D16: pairs eggs with hens present by day and flock, so a day with only one of the
-- two records cannot distort the rate.
create function analytics.hen_day_rate(
  p_business uuid, p_from date, p_to date, out value numeric, out status text, out note text
)
language plpgsql stable set search_path = '' as $$
declare
  paired_eggs numeric;
  paired_hens numeric;
  unmatched   int;
begin
  with rows as (
    select r.occurred_on, r.flock_id, r.quantity, r.created_at, t.code
      from operations.activity_records r
      join platform.activity_types t on t.id = r.activity_type_id
     where r.business_id = p_business and r.status = 'recorded'
       and r.occurred_on between p_from and p_to
  ),
  eggs as (
    select occurred_on, flock_id, sum(quantity) as total
      from rows where code = 'eggs_collected'
     group by occurred_on, flock_id
  ),
  hens as (
    select distinct on (occurred_on, flock_id) occurred_on, flock_id, quantity as total
      from rows where code = 'flock_count' and quantity > 0
     order by occurred_on, flock_id, created_at desc
  )
  select sum(e.total) filter (where h.total is not null),
         sum(h.total),
         count(*) filter (where h.total is null)
    into paired_eggs, paired_hens, unmatched
    from eggs e
    left join hens h on h.occurred_on = e.occurred_on and h.flock_id is not distinct from e.flock_id;

  if coalesce(paired_hens, 0) = 0 then
    value := null;
    status := 'unavailable';
    note := 'Record eggs collected and a flock count on the same days.';
  elsif unmatched > 0 then
    value := round(paired_eggs / paired_hens * 100, 1);
    status := 'estimated';
    note := format('Excludes %s day(s) with eggs but no flock count.', unmatched);
  else
    value := round(paired_eggs / paired_hens * 100, 1);
    status := 'actual';
    note := null;
  end if;
end $$;

-- FR-D17: only kilograms are comparable, so other units are left out rather than guessed.
create function analytics.feed_per_egg(
  p_business uuid, p_from date, p_to date, out value numeric, out status text, out note text
)
language plpgsql stable set search_path = '' as $$
declare
  paired_feed numeric;
  paired_eggs numeric;
  unmatched   int;
begin
  with rows as (
    select r.occurred_on, r.flock_id, r.quantity, r.unit, t.code
      from operations.activity_records r
      join platform.activity_types t on t.id = r.activity_type_id
     where r.business_id = p_business and r.status = 'recorded'
       and r.occurred_on between p_from and p_to
  ),
  feed as (
    select occurred_on, flock_id, sum(quantity) as total
      from rows where code = 'feed_used' and lower(unit) = 'kg'
     group by occurred_on, flock_id
  ),
  eggs as (
    select occurred_on, flock_id, sum(quantity) as total
      from rows where code = 'eggs_collected' and quantity > 0
     group by occurred_on, flock_id
  )
  select sum(f.total) filter (where e.total is not null),
         sum(e.total),
         count(*) filter (where e.total is null)
    into paired_feed, paired_eggs, unmatched
    from feed f
    left join eggs e on e.occurred_on = f.occurred_on and e.flock_id is not distinct from f.flock_id;

  if coalesce(paired_eggs, 0) = 0 then
    value := null;
    status := 'unavailable';
    note := 'Record feed used in kg and eggs collected on the same days.';
  elsif unmatched > 0 then
    value := round(paired_feed * 1000 / paired_eggs, 1);
    status := 'estimated';
    note := format('Excludes %s day(s) with feed but no egg collection.', unmatched);
  else
    value := round(paired_feed * 1000 / paired_eggs, 1);
    status := 'actual';
    note := null;
  end if;
end $$;

-- FR-D28: expected stock = latest count + received - sold + adjustments - wastage since then.
-- Each physical count replaces the running estimate, so errors do not build up over time.
-- Sold quantities come from sales, so this stays distinct from purchases (FR-D27).
create function analytics.expected_stock(
  p_business uuid, p_from date, p_to date, out value numeric, out status text, out note text
)
language plpgsql stable set search_path = '' as $$
declare
  opening_on date;
  opening    numeric;
  received   numeric;
  adjusted   numeric;
  wasted     numeric;
  sold       numeric;
begin
  select r.occurred_on, r.quantity into opening_on, opening
    from operations.activity_records r
    join platform.activity_types t on t.id = r.activity_type_id
   where r.business_id = p_business and r.status = 'recorded' and t.code = 'stock_count'
     and r.occurred_on <= p_to
   order by r.occurred_on desc, r.created_at desc
   limit 1;

  if opening_on is null then
    value := null;
    status := 'unavailable';
    note := 'Record a stock count to calculate expected stock.';
    return;
  end if;

  select coalesce(sum(r.quantity) filter (where t.code = 'stock_received'), 0),
         coalesce(sum(r.quantity) filter (where t.code = 'stock_adjustment'), 0),
         coalesce(sum(r.quantity) filter (where t.code = 'wastage'), 0)
    into received, adjusted, wasted
    from operations.activity_records r
    join platform.activity_types t on t.id = r.activity_type_id
   where r.business_id = p_business and r.status = 'recorded'
     and r.occurred_on > opening_on and r.occurred_on <= p_to;

  select coalesce(sum(s.quantity), 0) into sold
    from records.sales_transactions s
   where s.business_id = p_business and s.status = 'recorded'
     and s.occurred_on > opening_on and s.occurred_on <= p_to;

  value := opening + received - sold + adjusted - wasted;
  status := 'actual';
  note := format('From the stock count on %s.', opening_on);
end $$;

-- FR-E15, FR-E16: returns a value only when the data supports it, and always says which.
create function analytics.evaluate_kpi(
  p_business uuid, p_from date, p_to date, p_formula text, p_activity text,
  out value numeric, out status text, out note text
)
language plpgsql stable set search_path = '' as $$
#variable_conflict use_column
declare
  revenue    numeric;
  cost       numeric;
  has_soft   boolean;
  collected  numeric;
  rejected   numeric;
begin
  status := 'actual';

  if p_formula in ('revenue', 'recorded_balance') then
    select sum(total_amount) into revenue from records.sales_transactions
     where business_id = p_business and status = 'recorded' and occurred_on between p_from and p_to;
  end if;
  if p_formula in ('expenses', 'recorded_balance') then
    select sum(amount), coalesce(bool_or(certainty <> 'recorded'), false) into cost, has_soft
      from records.expenses
     where business_id = p_business and status = 'recorded' and occurred_on between p_from and p_to;
  end if;

  case p_formula
    when 'revenue' then
      value := revenue;
      if revenue is null then
        status := 'unavailable';
        note := 'No sales recorded in this period.';
      end if;
    when 'expenses' then
      value := cost;
      if cost is null then
        status := 'unavailable';
        note := 'No expenses recorded in this period.';
      elsif has_soft then
        status := 'estimated';
        note := 'Includes estimated or incomplete costs.';
      end if;
    when 'recorded_balance' then
      if revenue is null or cost is null then
        status := 'unavailable';
        note := 'Record at least one sale and one expense in this period.';
      else
        value := revenue - cost;
        status := 'estimated';
        note := 'Simple recorded balance, not verified net profit.';
      end if;
    when 'records_captured' then
      select (select count(*) from records.sales_transactions
               where business_id = p_business and status = 'recorded' and occurred_on between p_from and p_to)
           + (select count(*) from records.expenses
               where business_id = p_business and status = 'recorded' and occurred_on between p_from and p_to)
           + (select count(*) from operations.activity_records
               where business_id = p_business and status = 'recorded' and occurred_on between p_from and p_to)
        into value;
    when 'activity_total' then
      value := analytics.activity_total(p_business, p_from, p_to, p_activity);
      if value is null then
        status := 'unavailable';
        note := 'Nothing recorded for this in the period.';
      end if;
    when 'activity_latest' then
      select r.quantity into value
        from operations.activity_records r
        join platform.activity_types t on t.id = r.activity_type_id
       where r.business_id = p_business and r.status = 'recorded' and t.code = p_activity
         and r.occurred_on between p_from and p_to
       order by r.occurred_on desc, r.created_at desc
       limit 1;
      if value is null then
        status := 'unavailable';
        note := 'Nothing recorded for this in the period.';
      end if;
    when 'usable_eggs' then
      collected := analytics.activity_total(p_business, p_from, p_to, 'eggs_collected');
      rejected := coalesce(analytics.activity_total(p_business, p_from, p_to, 'eggs_rejected'), 0);
      if collected is null then
        status := 'unavailable';
        note := 'Record eggs collected to calculate usable eggs.';
      else
        value := collected - rejected;
      end if;
    when 'hen_day_rate' then
      select r.value, r.status, r.note into value, status, note
        from analytics.hen_day_rate(p_business, p_from, p_to) r;
    when 'feed_per_egg' then
      select r.value, r.status, r.note into value, status, note
        from analytics.feed_per_egg(p_business, p_from, p_to) r;
    when 'expected_stock' then
      select r.value, r.status, r.note into value, status, note
        from analytics.expected_stock(p_business, p_from, p_to) r;
    else
      status := 'unavailable';
      note := 'This KPI is not supported.';
  end case;
end $$;

-- FR-E10 to FR-E16: the KPI set for this business's industry, with explanations.
create function analytics.compute_kpis(p_business_id uuid, p_from date, p_to date)
returns table (
  code text, name text, explanation text, formula_text text, required_data text, unit_kind text,
  is_highlight boolean, value numeric, status text, note text, period_from date, period_to date
)
language plpgsql stable set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'analytics.view');
  if p_from > p_to then
    raise exception 'The reporting period start must be before its end.' using errcode = '22023';
  end if;

  return query
    select d.code, d.name, d.explanation, d.formula_text, d.required_data, d.unit_kind,
           ik.is_highlight, e.value, e.status, e.note, p_from, p_to
      from business.businesses b
      join platform.industry_kpis ik on ik.industry_code = b.industry_code
      join platform.kpi_definitions d on d.code = ik.kpi_code
     cross join lateral analytics.evaluate_kpi(p_business_id, p_from, p_to, d.formula, d.activity_code) e
     where b.id = p_business_id
     order by ik.sort_order;
end $$;

-- FR-E07: months with no records still appear, so gaps stay visible.
create function analytics.monthly_series(p_business_id uuid, p_months int default 6)
returns table (month date, revenue numeric, expenses numeric)
language plpgsql stable set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'analytics.view');

  return query
    with months as (
      select date_trunc('month', current_date - make_interval(months => n))::date as month
        from generate_series(0, greatest(p_months, 1) - 1) n
    )
    select m.month,
           coalesce((select sum(s.total_amount) from records.sales_transactions s
                      where s.business_id = p_business_id and s.status = 'recorded'
                        and date_trunc('month', s.occurred_on)::date = m.month), 0)::numeric,
           coalesce((select sum(x.amount) from records.expenses x
                      where x.business_id = p_business_id and x.status = 'recorded'
                        and date_trunc('month', x.occurred_on)::date = m.month), 0)::numeric
      from months m
     order by m.month;
end $$;

-- The prototype's recent activity feed, across sales, expenses and operations.
create function analytics.recent_activity(p_business_id uuid, p_limit int default 5)
returns table (
  id uuid, kind text, occurred_on date, label text, amount numeric,
  quantity numeric, unit text, created_at timestamptz
)
language plpgsql stable set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'records.view');

  return query
    select * from (
      select s.id, 'sale'::text, s.occurred_on, s.item_name, s.total_amount::numeric,
             s.quantity::numeric, s.unit, s.created_at
        from records.sales_transactions s
       where s.business_id = p_business_id and s.status = 'recorded'
      union all
      select x.id, 'expense'::text, x.occurred_on, x.category, x.amount::numeric,
             x.quantity::numeric, x.unit, x.created_at
        from records.expenses x
       where x.business_id = p_business_id and x.status = 'recorded'
      union all
      select r.id, 'activity'::text, r.occurred_on, t.name, null::numeric,
             r.quantity::numeric, r.unit, r.created_at
        from operations.activity_records r
        join platform.activity_types t on t.id = r.activity_type_id
       where r.business_id = p_business_id and r.status = 'recorded'
    ) feed
    order by 3 desc, 8 desc
    limit greatest(p_limit, 1);
end $$;

-- FR-E09, FR-E21: the prototype's "My Business Health" panel.
create function analytics.data_completeness(p_business_id uuid, p_from date, p_to date)
returns table (item text, label text, is_started boolean)
language plpgsql stable set search_path = '' as $$
begin
  perform authz.require_business_permission(p_business_id, 'analytics.view');

  return query
    select 'sales'::text, 'Revenue tracking'::text, exists (
             select 1 from records.sales_transactions
              where business_id = p_business_id and status = 'recorded' and occurred_on between p_from and p_to)
    union all
    select 'expenses', 'Expense tracking', exists (
             select 1 from records.expenses
              where business_id = p_business_id and status = 'recorded' and occurred_on between p_from and p_to)
    union all
    select 'operations', 'Operational records', exists (
             select 1 from operations.activity_records
              where business_id = p_business_id and status = 'recorded' and occurred_on between p_from and p_to)
    union all
    select 'profile', 'Business profile', exists (
             select 1 from business.businesses
              where id = p_business_id and main_goal is not null and location is not null);
end $$;

grant execute on function analytics.compute_kpis(uuid, date, date) to authenticated;
grant execute on function analytics.monthly_series(uuid, int) to authenticated;
grant execute on function analytics.recent_activity(uuid, int) to authenticated;
grant execute on function analytics.data_completeness(uuid, date, date) to authenticated;
-- compute_kpis runs as the caller, so its internals need execute too.
grant execute on function analytics.activity_total(uuid, date, date, text) to authenticated;
grant execute on function analytics.hen_day_rate(uuid, date, date) to authenticated;
grant execute on function analytics.feed_per_egg(uuid, date, date) to authenticated;
grant execute on function analytics.expected_stock(uuid, date, date) to authenticated;
grant execute on function analytics.evaluate_kpi(uuid, date, date, text, text) to authenticated;
