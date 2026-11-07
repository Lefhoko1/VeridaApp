// FR-D15 to FR-D17, FR-D28 and FR-E10 to FR-E16: every KPI, including its missing-data behaviour.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import {
  activityTypeId,
  asUser,
  createDatabase,
  createUser,
  kpis,
  recordActivity,
  registerBusiness,
} from './harness.mjs';

const FROM = '2026-10-01';
const TO = '2026-10-31';

describe('poultry KPIs', () => {
  let db, owner, types;

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db);
    types = {
      eggs: await activityTypeId(db, 'poultry', 'eggs_collected'),
      rejected: await activityTypeId(db, 'poultry', 'eggs_rejected'),
      hens: await activityTypeId(db, 'poultry', 'flock_count'),
      feed: await activityTypeId(db, 'poultry', 'feed_used'),
    };
  });

  const farm = () => registerBusiness(db, owner.id);

  test('with no records, nothing is calculated and each KPI says why (FR-E16)', async () => {
    const biz = await farm();
    const result = await kpis(db, owner.id, biz.id, FROM, TO);
    for (const code of ['revenue', 'expenses', 'recorded_balance', 'hen_day_rate', 'feed_per_egg', 'usable_eggs']) {
      assert.equal(result[code].value, null, code);
      assert.equal(result[code].status, 'unavailable', code);
      assert.ok(result[code].note, code);
    }
    assert.equal(result.records_captured.value, 0);
  });

  test('hen-day laying rate matches the worked example: 48 eggs / 60 hens = 80%', async () => {
    const biz = await farm();
    await asUser(db, owner.id, async (tx) => {
      await recordActivity(tx, biz.id, types.eggs, '2026-10-02', 48);
      await recordActivity(tx, biz.id, types.hens, '2026-10-02', 60);
    });
    const { hen_day_rate: rate } = await kpis(db, owner.id, biz.id, FROM, TO);
    assert.deepEqual(rate, { value: 80, status: 'actual', note: null });
  });

  test('days missing a flock count are excluded and the rate is marked estimated', async () => {
    const biz = await farm();
    await asUser(db, owner.id, async (tx) => {
      await recordActivity(tx, biz.id, types.eggs, '2026-10-02', 48);
      await recordActivity(tx, biz.id, types.hens, '2026-10-02', 60);
      await recordActivity(tx, biz.id, types.eggs, '2026-10-03', 999);
    });
    const { hen_day_rate: rate } = await kpis(db, owner.id, biz.id, FROM, TO);
    assert.equal(rate.value, 80);
    assert.equal(rate.status, 'estimated');
    assert.match(rate.note, /1 day/);
  });

  test('flocks are paired separately, not blended', async () => {
    const biz = await farm();
    await asUser(db, owner.id, async (tx) => {
      const flock = async (name) =>
        (await tx.query('insert into operations.flocks (business_id, name) values ($1, $2) returning id', [biz.id, name])).rows[0].id;
      const a = await flock('A');
      const b = await flock('B');
      await recordActivity(tx, biz.id, types.eggs, '2026-10-02', 50, { flockId: a });
      await recordActivity(tx, biz.id, types.hens, '2026-10-02', 100, { flockId: a });
      await recordActivity(tx, biz.id, types.eggs, '2026-10-02', 30, { flockId: b });
      // Flock B has no count, so its eggs must not be divided by flock A's hens.
    });
    const { hen_day_rate: rate } = await kpis(db, owner.id, biz.id, FROM, TO);
    assert.equal(rate.value, 50);
    assert.equal(rate.status, 'estimated');
  });

  test('usable eggs subtract broken or rejected eggs (FR-D15)', async () => {
    const biz = await farm();
    await asUser(db, owner.id, async (tx) => {
      await recordActivity(tx, biz.id, types.eggs, '2026-10-02', 48);
      await recordActivity(tx, biz.id, types.rejected, '2026-10-02', 3);
    });
    const result = await kpis(db, owner.id, biz.id, FROM, TO);
    assert.equal(result.usable_eggs.value, 45);
    assert.equal(result.eggs_collected.value, 48);
  });

  test('feed per egg uses grams per egg and ignores non-kg units (FR-D17)', async () => {
    const biz = await farm();
    await asUser(db, owner.id, async (tx) => {
      await recordActivity(tx, biz.id, types.eggs, '2026-10-02', 50);
      await recordActivity(tx, biz.id, types.feed, '2026-10-02', 7, { unit: 'kg' });
      await recordActivity(tx, biz.id, types.eggs, '2026-10-03', 50);
      await recordActivity(tx, biz.id, types.feed, '2026-10-03', 3, { unit: 'bags' });
    });
    const { feed_per_egg: feed } = await kpis(db, owner.id, biz.id, FROM, TO);
    assert.equal(feed.value, 140);
  });

  test('flock size is the latest count in the period', async () => {
    const biz = await farm();
    await asUser(db, owner.id, async (tx) => {
      await recordActivity(tx, biz.id, types.hens, '2026-10-02', 60);
      await recordActivity(tx, biz.id, types.hens, '2026-10-20', 58);
    });
    assert.equal((await kpis(db, owner.id, biz.id, FROM, TO)).flock_size.value, 58);
  });
});

describe('financial KPIs', () => {
  let db, owner;

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db);
  });

  const sale = (tx, biz, on, quantity, price) =>
    tx.query(
      `insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit_price)
       values ($1, $2, 'Item', 'Egg sales', $3, $4) returning id`,
      [biz, on, quantity, price],
    );
  const expense = (tx, biz, on, amount, certainty = 'recorded') =>
    tx.query(
      `insert into records.expenses (business_id, occurred_on, category, description, amount, certainty)
       values ($1, $2, 'Feed', 'Feed', $3, $4) returning id`,
      [biz, on, amount, certainty],
    );

  test('revenue and expenses respect the period and ignore voided records', async () => {
    const biz = await registerBusiness(db, owner.id);
    await asUser(db, owner.id, async (tx) => {
      await sale(tx, biz.id, '2026-10-05', 2, 50);
      await sale(tx, biz.id, '2026-09-30', 1, 999);
      const voided = await sale(tx, biz.id, '2026-10-06', 1, 777);
      await tx.query(`select records.void_sale($1, 'x')`, [voided.rows[0].id]);
      await expense(tx, biz.id, '2026-10-05', 30);
    });
    const result = await kpis(db, owner.id, biz.id, FROM, TO);
    assert.equal(result.revenue.value, 100);
    assert.equal(result.revenue.status, 'actual');
    assert.equal(result.expenses.value, 30);
    assert.equal(result.records_captured.value, 2);
  });

  test('the recorded balance is never presented as verified profit', async () => {
    const biz = await registerBusiness(db, owner.id);
    await asUser(db, owner.id, async (tx) => {
      await sale(tx, biz.id, '2026-10-05', 2, 50);
      await expense(tx, biz.id, '2026-10-05', 30);
    });
    const { recorded_balance: balance } = await kpis(db, owner.id, biz.id, FROM, TO);
    assert.equal(balance.value, 70);
    assert.equal(balance.status, 'estimated');
    assert.match(balance.note, /not verified net profit/);
  });

  test('the balance is unavailable when one side is missing', async () => {
    const biz = await registerBusiness(db, owner.id);
    await asUser(db, owner.id, (tx) => sale(tx, biz.id, '2026-10-05', 2, 50));
    assert.equal((await kpis(db, owner.id, biz.id, FROM, TO)).recorded_balance.status, 'unavailable');
  });

  test('estimated costs mark the expense KPI as estimated (FR-C30, FR-E15)', async () => {
    const biz = await registerBusiness(db, owner.id);
    await asUser(db, owner.id, (tx) => expense(tx, biz.id, '2026-10-05', 30, 'estimated'));
    assert.equal((await kpis(db, owner.id, biz.id, FROM, TO)).expenses.status, 'estimated');
  });

  test('the monthly series reports gaps as zero rather than skipping them', async () => {
    const biz = await registerBusiness(db, owner.id);
    await asUser(db, owner.id, (tx) => sale(tx, biz.id, new Date().toISOString().slice(0, 10), 2, 50));
    const { rows } = await asUser(db, owner.id, (tx) => tx.query('select * from analytics.monthly_series($1, 3)', [biz.id]));
    assert.equal(rows.length, 3);
    assert.deepEqual(rows.map((r) => Number(r.revenue)), [0, 0, 100]);
  });

  test('recent activity merges all record types, newest first', async () => {
    const biz = await registerBusiness(db, owner.id);
    const eggs = await activityTypeId(db, 'poultry', 'eggs_collected');
    await asUser(db, owner.id, async (tx) => {
      await sale(tx, biz.id, '2026-10-01', 1, 10);
      await expense(tx, biz.id, '2026-10-03', 20);
      await recordActivity(tx, biz.id, eggs, '2026-10-02', 48, { unit: 'eggs' });
    });
    const { rows } = await asUser(db, owner.id, (tx) => tx.query('select * from analytics.recent_activity($1, 5)', [biz.id]));
    assert.deepEqual(rows.map((r) => r.kind), ['expense', 'activity', 'sale']);
  });

  test('data completeness shows what has and has not been started (FR-E09)', async () => {
    const biz = await registerBusiness(db, owner.id);
    await asUser(db, owner.id, (tx) => sale(tx, biz.id, '2026-10-05', 1, 1));
    const { rows } = await asUser(db, owner.id, (tx) =>
      tx.query('select * from analytics.data_completeness($1, $2, $3)', [biz.id, FROM, TO]),
    );
    assert.deepEqual(Object.fromEntries(rows.map((r) => [r.item, r.is_started])), {
      sales: true,
      expenses: false,
      operations: false,
      profile: true,
    });
  });

  test('an inverted period is rejected', async () => {
    const biz = await registerBusiness(db, owner.id);
    await assert.rejects(kpis(db, owner.id, biz.id, TO, FROM), /must be before/);
  });
});

describe('retail KPIs', () => {
  let db, owner, types;

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db);
    types = {
      count: await activityTypeId(db, 'retail', 'stock_count'),
      received: await activityTypeId(db, 'retail', 'stock_received'),
      adjustment: await activityTypeId(db, 'retail', 'stock_adjustment'),
      wastage: await activityTypeId(db, 'retail', 'wastage'),
    };
  });

  const shop = () => registerBusiness(db, owner.id, { industry: 'retail' });
  const sell = (tx, biz, on, quantity) =>
    tx.query(
      `insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit_price)
       values ($1, $2, 'Item', 'Product sales', $3, 10)`,
      [biz, on, quantity],
    );

  test('expected stock is unavailable without a stock count', async () => {
    const biz = await shop();
    await asUser(db, owner.id, (tx) => recordActivity(tx, biz.id, types.received, '2026-10-02', 100));
    assert.equal((await kpis(db, owner.id, biz.id, FROM, TO)).expected_stock.status, 'unavailable');
  });

  test('expected stock = opening + received - sold + adjustments - wastage (FR-D28)', async () => {
    const biz = await shop();
    await asUser(db, owner.id, async (tx) => {
      await recordActivity(tx, biz.id, types.count, '2026-09-30', 500);
      await recordActivity(tx, biz.id, types.received, '2026-10-02', 100);
      await sell(tx, biz.id, '2026-10-03', 40);
      await recordActivity(tx, biz.id, types.adjustment, '2026-10-04', -5);
      await recordActivity(tx, biz.id, types.wastage, '2026-10-05', 3);
    });
    const result = await kpis(db, owner.id, biz.id, FROM, TO);
    assert.equal(result.expected_stock.value, 552);
    assert.match(result.expected_stock.note, /2026-09-30/);
    assert.equal(result.stock_received.value, 100);
    assert.equal(result.wastage.value, 3);
  });

  test('a newer count replaces the running estimate, so errors do not build up', async () => {
    const biz = await shop();
    await asUser(db, owner.id, async (tx) => {
      await recordActivity(tx, biz.id, types.count, '2026-09-30', 500);
      await sell(tx, biz.id, '2026-10-03', 900);
      await recordActivity(tx, biz.id, types.count, '2026-10-10', 480);
      await recordActivity(tx, biz.id, types.received, '2026-10-12', 20);
    });
    const { expected_stock: stock } = await kpis(db, owner.id, biz.id, FROM, TO);
    assert.equal(stock.value, 500);
    assert.match(stock.note, /2026-10-10/);
  });

  test('a count after the period end is not used', async () => {
    const biz = await shop();
    await asUser(db, owner.id, async (tx) => {
      await recordActivity(tx, biz.id, types.count, '2026-10-05', 100);
      await recordActivity(tx, biz.id, types.count, '2026-11-15', 999);
    });
    assert.equal((await kpis(db, owner.id, biz.id, FROM, TO)).expected_stock.value, 100);
  });

  test('sales before the count do not reduce it', async () => {
    const biz = await shop();
    await asUser(db, owner.id, async (tx) => {
      await sell(tx, biz.id, '2026-10-01', 999);
      await recordActivity(tx, biz.id, types.count, '2026-10-02', 200);
      await sell(tx, biz.id, '2026-10-03', 20);
    });
    assert.equal((await kpis(db, owner.id, biz.id, FROM, TO)).expected_stock.value, 180);
  });
});

describe('industry configuration', () => {
  test('every industry resolves a KPI set that evaluates without error', async () => {
    const db = await createDatabase();
    const owner = await createUser(db);
    for (const industry of ['poultry', 'retail', 'salon', 'food', 'professional', 'other']) {
      const biz = await registerBusiness(db, owner.id, { industry });
      const result = await kpis(db, owner.id, biz.id, FROM, TO);
      assert.ok(Object.keys(result).length >= 7, industry);
      assert.equal(result.revenue.status, 'unavailable', industry);
    }
  });
});
