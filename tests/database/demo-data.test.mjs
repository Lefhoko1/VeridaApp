// The demo script must keep working as the schema changes, and must produce plausible KPIs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { asUser, createDatabase, createUser, kpis } from './harness.mjs';

const SCRIPT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../supabase/dev/load_demo_data.sql'), 'utf8');
const forEmail = (email) => SCRIPT.replace('demo@verida.test', email);

const iso = (daysAgo) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
};

describe('demo data', () => {
  test('refuses to run without an existing account', async () => {
    const db = await createDatabase();
    await assert.rejects(db.exec(forEmail('nobody@verida.test')), /Sign up in the app first/);
  });

  test('creates both businesses with plausible KPIs', async () => {
    const db = await createDatabase();
    const owner = await createUser(db);
    await db.exec(forEmail(owner.email));

    const workspaces = await asUser(db, owner.id, async (tx) => (await tx.query('select id, name from business.my_workspaces()')).rows);
    assert.deepEqual(workspaces.map((w) => w.name).sort(), ['Tsholofelo Tuckshop', 'Vinabbie AgriSolutions']);

    const farm = workspaces.find((w) => w.name.startsWith('Vinabbie'));
    const farmKpis = await kpis(db, owner.id, farm.id, iso(29), iso(0));
    assert.equal(farmKpis.hen_day_rate.status, 'actual');
    assert.ok(farmKpis.hen_day_rate.value > 70 && farmKpis.hen_day_rate.value < 95, `rate ${farmKpis.hen_day_rate.value}`);
    assert.ok(farmKpis.revenue.value > 0);
    assert.ok(farmKpis.expenses.value > farmKpis.revenue.value, 'the prototype farm spends more than it records in sales');

    const shop = workspaces.find((w) => w.name.startsWith('Tsholofelo'));
    const shopKpis = await kpis(db, owner.id, shop.id, iso(29), iso(0));
    assert.equal(shopKpis.expected_stock.status, 'actual');
    assert.ok(shopKpis.stock_received.value > 0);
  });
});
