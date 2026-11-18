// A business can be more than one type, and each type brings its own categories, activities and measures.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

import { asUser, createDatabase, createUser } from './harness.mjs';

describe('a business with several types', () => {
  let db, owner;

  const as = async (sql, params = []) => (await asUser(db, owner.id, (tx) => tx.query(sql, params))).rows;

  const register = async (additional, other = null) => {
    const [row] = await as(
      `select (b).id as id, (b).additional_industries as additional, (b).other_type as other
         from (select business.register_business('Mixed', 'poultry', 'Already operating', 'Small-scale', 'Botswana', null, 'BWP',
                                                  'Grow; Learn', null, $1::text[], $2) as b) r`,
      [additional, other],
    );
    return row;
  };

  const recordRetailActivity = async (businessId) => {
    const { rows } = await db.query("select id, default_unit from platform.activity_types where industry_code = 'retail' order by sort_order limit 1");
    const type = rows[0];
    assert.ok(type, 'retail has an activity type');
    await as(
      `insert into operations.activity_records (business_id, activity_type_id, occurred_on, quantity, unit)
       values ($1, $2, current_date, 1, $3)`,
      [businessId, type.id, type.default_unit],
    );
  };

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db, { name: 'Mixed Owner' });
  });

  test('one type still works as before', async () => {
    assert.deepEqual((await register([])).additional, []);
  });

  test('more types are kept in order, without the main type or repeats', async () => {
    assert.deepEqual((await register(['retail', 'poultry', 'food', 'retail'])).additional, ['retail', 'food']);
  });

  test('an unknown type is refused', async () => {
    await assert.rejects(register(['spaceships']), /supported business type/);
  });

  test('a typed description of the business is kept and tidied', async () => {
    assert.equal((await register(['other'], '  Tailoring ')).other, 'Tailoring');
  });

  test('a business sees the categories of all its types, each once', async () => {
    const list = async (id) => (await as('select records.list_categories($1, $2) as name', [id, 'expense'])).map((row) => row.name);
    const mainOnly = await list((await register([])).id);
    const both = await list((await register(['retail'])).id);
    assert.ok(both.length > mainOnly.length);
    assert.ok(both.includes('Rent') && !mainOnly.includes('Rent'), 'retail adds its own expense categories');
    assert.equal(new Set(both).size, both.length);
    for (const name of mainOnly) assert.ok(both.includes(name), name);
  });

  test('a business sees the measures of all its types, each once, with only the main highlights', async () => {
    const kpis = (id) => as('select code, is_highlight from analytics.compute_kpis($1, (current_date - 30)::date, current_date)', [id]);
    const mainKpis = await kpis((await register([])).id);
    const mixedKpis = await kpis((await register(['retail'])).id);
    assert.ok(mixedKpis.length > mainKpis.length);
    assert.equal(new Set(mixedKpis.map((row) => row.code)).size, mixedKpis.length);
    const highlights = (rows) => rows.filter((row) => row.is_highlight).map((row) => row.code).sort();
    assert.deepEqual(highlights(mixedKpis), highlights(mainKpis));
    // The main type's measures come first, so the dashboard reads the same as before.
    assert.deepEqual(mixedKpis.slice(0, mainKpis.length).map((row) => row.code), mainKpis.map((row) => row.code));
  });

  test('an activity from an added type can be recorded, but not one from another type', async () => {
    await recordRetailActivity((await register(['retail'])).id);
    await assert.rejects(recordRetailActivity((await register([])).id), /not available for this type of business/);
  });

  test('a type can be added at any time, but not removed once records depend on it', async () => {
    const mixed = await register(['retail']);
    await recordRetailActivity(mixed.id);
    await as('update business.businesses set additional_industries = $2 where id = $1', [mixed.id, ['retail', 'food']]);
    await assert.rejects(as('update business.businesses set additional_industries = $2 where id = $1', [mixed.id, ['food']]), /cannot change once operational records exist/);
  });

  test('the main type can swap with one that keeps its records valid', async () => {
    const mixed = await register(['retail']);
    await recordRetailActivity(mixed.id);
    await as("update business.businesses set industry_code = 'retail', additional_industries = $2 where id = $1", [mixed.id, ['poultry']]);
    const [row] = await as('select industry_code, additional_industries from business.businesses where id = $1', [mixed.id]);
    assert.equal(row.industry_code, 'retail');
    assert.deepEqual(row.additional_industries, ['poultry']);
  });

  test('my_workspaces reports every type', async () => {
    const mixed = await register(['retail', 'other'], 'Tailoring');
    const row = (await as('select id, additional_industries, other_type from business.my_workspaces()')).find((item) => item.id === mixed.id);
    assert.deepEqual(row.additional_industries, ['retail', 'other']);
    assert.equal(row.other_type, 'Tailoring');
  });
});
