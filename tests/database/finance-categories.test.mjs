// Business Taxonomy & Configuration Catalogue v1.0, sections 3 and 4: universal sales and expense
// categories that staff maintain, and that every sale and expense is reported under.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

import { asUser, createDatabase, createUser, grantPlatformRole, registerBusiness } from './harness.mjs';

describe('universal sales and expense categories', () => {
  let db, owner, admin, farm;

  const as = async (user, sql, params = []) => (await asUser(db, user.id, (tx) => tx.query(sql, params))).rows;
  const options = (kind) => as(owner, 'select name, group_code from records.category_options($1, $2)', [farm.id, kind]);
  const addSale = async (category) =>
    (await as(owner, `insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit_price)
                      values ($1, current_date, 'Item', $2, 1, 10) returning category_code`, [farm.id, category]))[0].category_code;
  const addExpense = async (category) =>
    (await as(owner, `insert into records.expenses (business_id, occurred_on, category, description, amount)
                      values ($1, current_date, $2, 'Cost', 10) returning category_code`, [farm.id, category]))[0].category_code;

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db, { name: 'Finance Owner' });
    admin = await createUser(db, { name: 'Finance Admin' });
    await grantPlatformRole(db, admin.id, 'administrator');
    farm = await registerBusiness(db, owner.id, { name: 'Egg Farm', industry: 'poultry' });
  });

  test('the catalogue has nine sales and twelve expense categories', async () => {
    const rows = await as(owner, `select kind, count(*)::int as n from platform.finance_categories where parent_code is null group by kind order by kind`);
    assert.deepEqual(rows, [{ kind: 'expense', n: 12 }, { kind: 'sale', n: 9 }]);
    const [{ n }] = await as(owner, `select count(*)::int as n from platform.finance_categories where parent_code = 'stock_materials'`);
    assert.equal(n, 6);
  });

  test("every original type's categories belong to a universal one", async () => {
    const rows = await as(owner, 'select industry_code, name from platform.record_categories where finance_category_code is null');
    assert.deepEqual(rows, []);
  });

  test("the business's own categories come first, then the universal ones, each name once", async () => {
    const expenses = await options('expense');
    assert.deepEqual(expenses.slice(0, 2), [{ name: 'Feed', group_code: 'stock_materials' }, { name: 'Medication', group_code: 'stock_materials' }]);
    assert.ok(expenses.some((o) => o.name === 'Stock and materials' && o.group_code === 'stock_materials'));
    assert.ok(expenses.some((o) => o.name === 'Electricity' && o.group_code === 'utilities_comms'));
    assert.equal(expenses.filter((o) => o.name.toLowerCase() === 'packaging').length, 1);

    const sales = await options('sale');
    assert.equal(sales[0].name, 'Egg sales');
    assert.equal(sales.filter((o) => o.group_code !== null).length, sales.length);
    assert.deepEqual(await as(owner, 'select * from records.list_categories($1, $2) limit 1', [farm.id, 'sale']), [{ list_categories: 'Egg sales' }]);
  });

  test('another business cannot read the options', async () => {
    const stranger = await createUser(db, { name: 'Stranger' });
    await assert.rejects(as(stranger, 'select * from records.category_options($1, $2)', [farm.id, 'sale']));
  });

  test('every sale and expense is classified under a universal category', async () => {
    assert.equal(await addSale('Egg sales'), 'product_sales');
    assert.equal(await addSale('Rental and hire income'), 'rental_hire_income');
    assert.equal(await addExpense('Feed'), 'stock_materials');
    assert.equal(await addExpense('electricity'), 'utilities_comms');
    assert.equal(await addExpense('Something unusual'), 'other_expenses');
    assert.equal(await addSale('Something unusual'), 'other_operating_sales');
  });

  test('changing the category reclassifies the record, and the client cannot set the code itself', async () => {
    const [row] = await as(owner, `insert into records.expenses (business_id, occurred_on, category, description, amount)
                                   values ($1, current_date, 'Feed', 'Feed bag', 10) returning id`, [farm.id]);
    const [updated] = await as(owner, `update records.expenses set category = 'Fuel' where id = $1 returning category_code`, [row.id]);
    assert.equal(updated.category_code, 'transport_delivery');
    await assert.rejects(as(owner, `update records.expenses set category_code = 'finance_costs' where id = $1`, [row.id]), /permission denied/);
  });

  test('an ordinary user cannot change the catalogue', async () => {
    await assert.rejects(as(owner, `insert into platform.finance_categories (code, kind, name) values ('gifts', 'sale', 'Gifts')`), /row-level security/);
  });

  test('an administrator adds a subcategory, which classifies records at once', async () => {
    await as(admin, `insert into platform.finance_categories (code, kind, parent_code, name) values ('solar', 'expense', 'utilities_comms', 'Solar power')`);
    assert.equal(await addExpense('Solar power'), 'utilities_comms');
    assert.ok((await options('expense')).some((o) => o.name === 'Solar power'));
  });

  test('subcategories stay one level deep and the same kind as their category', async () => {
    await assert.rejects(as(admin, `insert into platform.finance_categories (code, kind, parent_code, name) values ('deep', 'expense', 'solar', 'Panels')`), /main category/);
    await assert.rejects(as(admin, `insert into platform.finance_categories (code, kind, parent_code, name) values ('mixed', 'sale', 'utilities_comms', 'Mixed')`), /same kind/);
    await assert.rejects(as(admin, `update platform.record_categories set finance_category_code = 'product_sales' where name = 'Feed'`), /sales group/);
  });

  test('a deactivated category is no longer offered, but old records keep it', async () => {
    await as(admin, `update platform.finance_categories set is_active = false where code = 'solar'`);
    assert.ok(!(await options('expense')).some((o) => o.name === 'Solar power'));
    const [{ n }] = await as(owner, `select count(*)::int as n from records.expenses where category = 'Solar power' and category_code = 'utilities_comms'`);
    assert.equal(n, 1);
  });

  test('a category in use cannot be deleted', async () => {
    await assert.rejects(as(admin, `delete from platform.finance_categories where code = 'utilities_comms'`), /foreign key/);
  });

  test('catalogue changes are audited', async () => {
    const { rows } = await db.query(`select action from audit.record_changes where table_name = 'finance_categories'`);
    assert.ok(rows.some((row) => row.action === 'INSERT'));
    assert.ok(rows.some((row) => row.action === 'UPDATE'));
  });
});
