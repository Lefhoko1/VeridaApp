// Industry-specific Activity Catalogue v1.0: groups, forms as data, lifecycle and links.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

import { addMember, asUser, createDatabase, createUser, grantPlatformRole, kpis, registerBusiness } from './harness.mjs';

describe('activity catalogue', () => {
  let db, owner, admin, staff, farm, shop;

  const as = async (user, sql, params = []) => (await asUser(db, user.id, (tx) => tx.query(sql, params))).rows;
  const typeId = async (industry, code) =>
    (await db.query('select id from platform.activity_types where industry_code = $1 and code = $2', [industry, code])).rows[0].id;
  const insert = (user, businessId, type, fields = {}) => {
    const columns = ['business_id', 'activity_type_id', 'occurred_on', ...Object.keys(fields)];
    const values = [businessId, type, '2026-10-05', ...Object.values(fields)];
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(', ');
    return as(user, `insert into operations.activity_records (${columns.join(', ')}) values (${placeholders}) returning *`, values);
  };
  const eggsKpi = async () => (await kpis(db, owner.id, farm.id, '2026-10-01', '2026-10-31')).eggs_collected;

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db, { name: 'Activity Owner' });
    admin = await createUser(db, { name: 'Activity Admin' });
    staff = await createUser(db, { name: 'Activity Staff' });
    await grantPlatformRole(db, admin.id, 'administrator');
    farm = await registerBusiness(db, owner.id, { name: 'Layer Farm', industry: 'poultry' });
    shop = await registerBusiness(db, owner.id, { name: 'Corner Shop', industry: 'retail' });
    await addMember(db, owner.id, staff, farm.id, 'staff');
  });

  test('ten activity groups, and every subcategory has activities', async () => {
    const groups = await db.query('select count(*)::int as n from platform.activity_groups');
    assert.equal(groups.rows[0].n, 10);
    const empty = await db.query(`select i.code from platform.industries i
                                   where not exists (select 1 from platform.activity_types t where t.industry_code = i.code)`);
    assert.deepEqual(empty.rows, []);
  });

  test('a business sees its types with their fields, and optional ones start switched off', async () => {
    const types = await as(owner, 'select code, is_enabled, fields from operations.business_activity_types($1)', [farm.id]);
    const byCode = Object.fromEntries(types.map((t) => [t.code, t]));
    assert.equal(byCode.eggs_collected.is_enabled, true);
    assert.equal(byCode.water_check.is_enabled, false);
    assert.deepEqual(byCode.mortality.fields.map((f) => f.code), ['cause']);
    assert.equal(byCode.stock_count, undefined, 'only activities of the business types');
  });

  test('an owner switches a type on, and staff cannot', async () => {
    const water = await typeId('poultry', 'water_check');
    await assert.rejects(insert(owner, farm.id, water, { details: { water_ok: true } }), /switched off/);
    await assert.rejects(as(staff, 'select operations.set_activity_type_enabled($1, $2, true)', [farm.id, water]));
    await as(owner, 'select operations.set_activity_type_enabled($1, $2, true)', [farm.id, water]);
    const [row] = await insert(owner, farm.id, water, { details: { water_ok: true } });
    assert.equal(row.quantity, null);
  });

  test('form answers are checked against the fields', async () => {
    const mortality = await typeId('poultry', 'mortality');
    await assert.rejects(insert(owner, farm.id, mortality, { quantity: 2, unit: 'birds' }), /Cause is required/);
    await assert.rejects(insert(owner, farm.id, mortality, { quantity: 2, unit: 'birds', details: { cause: 'Aliens' } }), /must be one of/);
    await assert.rejects(insert(owner, farm.id, mortality, { quantity: 2, unit: 'birds', details: { cause: 'Heat stress', colour: 'red' } }), /no field called colour/);
    const [row] = await insert(owner, farm.id, mortality, { quantity: 2, unit: 'birds', details: { cause: 'Heat stress' } });
    assert.ok(row.form_version >= 1);
  });

  test('a planned activity can wait for its quantity, and never counts in measures', async () => {
    const eggs = await typeId('poultry', 'eggs_collected');
    const [planned] = await insert(owner, farm.id, eggs, { status: 'planned' });
    assert.equal(planned.quantity, null);
    await insert(owner, farm.id, eggs, { quantity: 100, unit: 'eggs' });
    await as(owner, 'update operations.activity_records set quantity = 50, unit = $2 where id = $1', [planned.id, 'eggs']);
    assert.equal(Number((await eggsKpi()).value), 100);
    await as(owner, 'select operations.set_activity_status($1, $2)', [planned.id, 'recorded']);
    assert.equal(Number((await eggsKpi()).value), 150);
  });

  test('completing needs what the form requires, and the lifecycle only moves forward', async () => {
    const eggs = await typeId('poultry', 'eggs_collected');
    const [planned] = await insert(owner, farm.id, eggs, { status: 'planned' });
    await assert.rejects(as(owner, 'select operations.set_activity_status($1, $2)', [planned.id, 'recorded']), /needs a quantity/);
    await as(owner, 'select operations.set_activity_status($1, $2)', [planned.id, 'cancelled']);
    await assert.rejects(as(owner, 'select operations.set_activity_status($1, $2)', [planned.id, 'planned']), /cannot change/);
    await assert.rejects(insert(owner, farm.id, eggs, { status: 'voided', quantity: 1 }), /must be planned/);
  });

  test('links point only at the same business, and the responsible person must be a member', async () => {
    const [sale] = await as(owner, `insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit_price)
                                    values ($1, '2026-10-05', 'Eggs', 'Egg sales', 10, 5) returning id`, [farm.id]);
    const [otherSale] = await as(owner, `insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit_price)
                                         values ($1, '2026-10-05', 'Bread', 'Product sales', 1, 5) returning id`, [shop.id]);
    const dispatch = await typeId('poultry', 'sales_dispatch');
    await as(owner, 'select operations.set_activity_type_enabled($1, $2, true)', [farm.id, dispatch]);
    const [linked] = await insert(owner, farm.id, dispatch, { sale_id: sale.id, responsible_user_id: staff.id, details: { destination: 'Market' } });
    assert.equal(linked.sale_id, sale.id);
    await assert.rejects(insert(owner, farm.id, dispatch, { sale_id: otherSale.id, details: { destination: 'Market' } }), /foreign key/);
    const stranger = await createUser(db, { name: 'Not a member' });
    await assert.rejects(insert(owner, farm.id, dispatch, { responsible_user_id: stranger.id, details: { destination: 'Market' } }), /must be a member/);
  });

  test('changing a field raises the form version, and a used field cannot be deleted', async () => {
    const mortality = await typeId('poultry', 'mortality');
    const version = async () => (await db.query('select form_version from platform.activity_types where id = $1', [mortality])).rows[0].form_version;
    const before = await version();
    await as(admin, `insert into platform.activity_type_fields (activity_type_id, code, label, data_type) values ($1, 'house', 'House', 'text')`, [mortality]);
    assert.equal(await version(), before + 1);
    await assert.rejects(as(admin, `delete from platform.activity_type_fields where activity_type_id = $1 and code = 'cause'`, [mortality]), /Deactivate it instead/);
    await as(admin, `delete from platform.activity_type_fields where activity_type_id = $1 and code = 'house'`, [mortality]);
  });

  test('only staff with configuration access change groups and fields', async () => {
    await assert.rejects(as(owner, `insert into platform.activity_groups (code, name) values ('fun', 'Fun')`), /row-level security/);
    const mortality = await typeId('poultry', 'mortality');
    await assert.rejects(as(owner, `insert into platform.activity_type_fields (activity_type_id, code, label, data_type) values ($1, 'x', 'X', 'text')`, [mortality]), /row-level security/);
    await as(admin, `update platform.activity_groups set description = 'Meetings and planning.' where code = 'administration'`);
  });

  test('a deactivated group hides its types from new records', async () => {
    await as(admin, `update platform.activity_groups set is_active = false where code = 'quality_compliance'`);
    const types = await as(owner, 'select code from operations.business_activity_types($1)', [farm.id]);
    assert.ok(!types.some((t) => t.code === 'water_check'));
    const water = await typeId('poultry', 'water_check');
    await assert.rejects(insert(owner, farm.id, water, { details: { water_ok: true } }), /switched off/);
    await as(admin, `update platform.activity_groups set is_active = true where code = 'quality_compliance'`);
  });
});
