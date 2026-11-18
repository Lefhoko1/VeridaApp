// Business Taxonomy & Configuration Catalogue v1.0: categories and subcategories are data that
// Verida staff maintain, and the database enforces which types a business may choose.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';

import { asUser, createDatabase, createUser, grantPlatformRole, registerBusiness } from './harness.mjs';

describe('business categories and subcategories', () => {
  let db, owner, admin;

  const as = async (user, sql, params = []) => (await asUser(db, user.id, (tx) => tx.query(sql, params))).rows;

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db, { name: 'Taxonomy Owner' });
    admin = await createUser(db, { name: 'Taxonomy Admin' });
    await grantPlatformRole(db, admin.id, 'administrator');
  });

  test('the catalogue has ten categories, each with subcategories', async () => {
    const rows = await as(
      owner,
      `select c.code, count(i.code)::int as subcategories
         from platform.business_categories c
         left join platform.industries i on i.category_code = c.code
        group by c.code, c.sort_order order by c.sort_order`,
    );
    assert.equal(rows.length, 10);
    for (const row of rows) assert.ok(row.subcategories > 0, `${row.code} has subcategories`);
    const [{ total }] = await as(owner, 'select count(*)::int as total from platform.industries');
    assert.equal(total, 87);
  });

  test('the original types keep their codes under their new categories', async () => {
    const rows = await as(owner, `select code, category_code, name from platform.industries where code in ('poultry','retail','salon','food','professional','other') order by code`);
    assert.deepEqual(
      rows.map((row) => [row.code, row.category_code]),
      [
        ['food', 'food_hospitality'],
        ['other', 'digital_creative_other'],
        ['poultry', 'agriculture'],
        ['professional', 'professional_services'],
        ['retail', 'retail_wholesale'],
        ['salon', 'beauty_personal'],
      ],
    );
  });

  test('every subcategory has the shared financial measures', async () => {
    const rows = await as(
      owner,
      `select i.code from platform.industries i
        where (select count(*) from platform.industry_kpis k
                where k.industry_code = i.code and k.kpi_code in ('revenue','expenses','recorded_balance','records_captured')) <> 4`,
    );
    assert.deepEqual(rows, []);
  });

  test('a business can register under a new subcategory', async () => {
    const business = await registerBusiness(db, owner.id, { name: 'Honey Co', industry: 'beekeeping' });
    assert.equal(business.industry_code, 'beekeeping');
  });

  test('an ordinary user cannot change the catalogue', async () => {
    await assert.rejects(as(owner, `insert into platform.business_categories (code, name) values ('mining', 'Mining')`), /row-level security/);
    const updated = await as(owner, `update platform.business_categories set name = 'Changed' where code = 'agriculture' returning code`);
    assert.deepEqual(updated, []);
  });

  test('an administrator adds a category and a subcategory, which gets the shared measures', async () => {
    await as(admin, `insert into platform.business_categories (code, name, sort_order) values ('mining', 'Mining & quarrying', 11)`);
    await as(
      admin,
      `insert into platform.industries (code, category_code, name, short_name, description, icon, chart_title)
       values ('small_mining', 'mining', 'Small-scale mining', 'Mine', 'Small mining operations', 'pickaxe', 'Mining activity')`,
    );
    const kpis = await as(owner, `select kpi_code from platform.industry_kpis where industry_code = 'small_mining' order by sort_order`);
    assert.deepEqual(kpis.map((row) => row.kpi_code), ['revenue', 'expenses', 'recorded_balance', 'records_captured']);
    const business = await registerBusiness(db, owner.id, { name: 'Quarry', industry: 'small_mining' });
    assert.equal(business.industry_code, 'small_mining');
  });

  test('a subcategory in a deactivated category cannot be chosen, but existing businesses keep it', async () => {
    await as(admin, `update platform.business_categories set is_active = false where code = 'mining'`);
    await assert.rejects(registerBusiness(db, owner.id, { name: 'Second quarry', industry: 'small_mining' }), /supported business type/);

    const [existing] = await as(owner, `select id from business.businesses where name = 'Quarry'`);
    await as(owner, `update business.businesses set location = 'Palapye' where id = $1`, [existing.id]);

    const [farm] = await as(owner, `select (b).id as id from (select business.register_business('Farm', 'poultry', 'Already operating', 'Small-scale', 'Botswana', null, 'BWP', null, null) as b) r`);
    await assert.rejects(
      as(owner, `update business.businesses set additional_industries = '{small_mining}' where id = $1`, [farm.id]),
      /supported business type/,
    );
    await assert.rejects(as(owner, `update business.businesses set industry_code = 'small_mining' where id = $1`, [farm.id]), /supported business type/);
  });

  test('a category with subcategories cannot be deleted', async () => {
    await assert.rejects(as(admin, `delete from platform.business_categories where code = 'mining'`), /foreign key/);
  });

  test('catalogue changes are audited', async () => {
    const { rows } = await db.query(`select action from audit.record_changes where table_name = 'business_categories' order by id`);
    assert.ok(rows.some((row) => row.action === 'INSERT'));
    assert.ok(rows.some((row) => row.action === 'UPDATE'));
  });
});
