// FR-B25, FR-B26, FR-I13, FR-I14 and section 7: who may see and do what, enforced in the database.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import {
  activityTypeId,
  addMember,
  asAnon,
  asUser,
  createDatabase,
  createUser,
  grantPlatformRole,
  recordActivity,
  registerBusiness,
} from './harness.mjs';

const insertSale = (tx, businessId, overrides = {}) =>
  tx.query(
    `insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit_price)
     values ($1, $2, $3, 'Egg sales', $4, $5) returning *`,
    [businessId, overrides.on ?? '2026-10-01', overrides.item ?? 'Eggs', overrides.quantity ?? 2, overrides.price ?? 42],
  );

describe('identity', () => {
  let db;
  before(async () => {
    db = await createDatabase();
  });

  test('a profile follows the auth user and activates on verification (FR-A04, FR-A07)', async () => {
    const user = await createUser(db, { confirmed: false, name: 'Neo' });
    const read = async () =>
      (await db.query('select full_name, account_status from identity.profiles where id = $1', [user.id])).rows[0];
    assert.deepEqual(await read(), { full_name: 'Neo', account_status: 'pending_verification' });

    await db.query('update auth.users set email_confirmed_at = now() where id = $1', [user.id]);
    assert.equal((await read()).account_status, 'active');
  });

  test('a user can edit their name but not their account status', async () => {
    const user = await createUser(db);
    await asUser(db, user.id, (tx) =>
      tx.query(`update identity.profiles set full_name = 'Renamed' where id = $1`, [user.id]),
    );
    await assert.rejects(
      asUser(db, user.id, (tx) =>
        tx.query(`update identity.profiles set account_status = 'active' where id = $1`, [user.id]),
      ),
      /permission denied/,
    );
  });

  test('a user cannot read another profile', async () => {
    const [a, b] = [await createUser(db), await createUser(db)];
    const { rows } = await asUser(db, a.id, (tx) => tx.query('select id from identity.profiles'));
    assert.deepEqual(rows.map((r) => r.id), [a.id]);
    assert.notEqual(rows[0].id, b.id);
  });

  test('an unverified user cannot register a business', async () => {
    const user = await createUser(db, { confirmed: false });
    await assert.rejects(registerBusiness(db, user.id), /Verify your account/);
  });

  test('the anon role cannot read any module', async () => {
    await assert.rejects(asAnon(db, (tx) => tx.query('select * from records.sales_transactions')), /permission denied/);
    await assert.rejects(asAnon(db, (tx) => tx.query('select * from identity.profiles')), /permission denied/);
  });
});

describe('tenant isolation', () => {
  let db, ownerA, ownerB, bizA, bizB;

  before(async () => {
    db = await createDatabase();
    ownerA = await createUser(db);
    ownerB = await createUser(db);
    bizA = await registerBusiness(db, ownerA.id, { name: 'A' });
    bizB = await registerBusiness(db, ownerB.id, { name: 'B' });
    await asUser(db, ownerA.id, (tx) => insertSale(tx, bizA.id));
  });

  test('an owner sees only their own business and records', async () => {
    const seen = await asUser(db, ownerB.id, async (tx) => ({
      businesses: (await tx.query('select id from business.businesses')).rows,
      sales: (await tx.query('select id from records.sales_transactions')).rows,
      audit: (await tx.query('select id from audit.record_changes where business_id = $1', [bizA.id])).rows,
    }));
    assert.deepEqual(seen.businesses.map((b) => b.id), [bizB.id]);
    assert.equal(seen.sales.length, 0);
    assert.equal(seen.audit.length, 0);
  });

  test('a record cannot be written into another business', async () => {
    await assert.rejects(asUser(db, ownerB.id, (tx) => insertSale(tx, bizA.id)), /row-level security/);
  });

  test('analytics refuses another business rather than returning empty results', async () => {
    await assert.rejects(
      asUser(db, ownerB.id, (tx) => tx.query(`select * from analytics.compute_kpis($1, '2026-10-01', '2026-10-31')`, [bizA.id])),
      /do not have permission/,
    );
  });

  test('a sale cannot reference another business product', async () => {
    const product = await asUser(db, ownerB.id, async (tx) => {
      const { rows } = await tx.query(
        `insert into records.products (business_id, name, unit, selling_price) values ($1, 'Tray', 'tray', 42) returning id`,
        [bizB.id],
      );
      return rows[0];
    });
    await assert.rejects(
      asUser(db, ownerA.id, (tx) =>
        tx.query(
          `insert into records.sales_transactions (business_id, occurred_on, product_id, item_name, category, quantity, unit_price)
           values ($1, '2026-10-01', $2, 'Tray', 'Egg sales', 1, 42)`,
          [bizA.id, product.id],
        ),
      ),
      /foreign key/,
    );
  });

  test('conversations are private to their owner and the business', async () => {
    const id = await asUser(db, ownerA.id, async (tx) => {
      const { rows } = await tx.query(
        `insert into assistant.conversations (user_id, business_id, title) values ($1, $2, 'Q') returning id`,
        [ownerA.id, bizA.id],
      );
      await tx.query(`insert into assistant.messages (conversation_id, role, content) values ($1, 'user', 'hi')`, [rows[0].id]);
      return rows[0].id;
    });
    const seen = await asUser(db, ownerB.id, async (tx) => ({
      conversations: (await tx.query('select id from assistant.conversations')).rows,
      messages: (await tx.query('select id from assistant.messages where conversation_id = $1', [id])).rows,
    }));
    assert.equal(seen.conversations.length, 0);
    assert.equal(seen.messages.length, 0);
    await assert.rejects(
      asUser(db, ownerB.id, (tx) =>
        tx.query(`insert into assistant.messages (conversation_id, role, content) values ($1, 'user', 'x')`, [id]),
      ),
      /row-level security/,
    );
  });
});

describe('business roles', () => {
  let db, owner, staff, viewer, biz;

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db);
    staff = await createUser(db);
    viewer = await createUser(db);
    biz = await registerBusiness(db, owner.id);
    await addMember(db, owner.id, staff, biz.id, 'staff');
    await addMember(db, owner.id, viewer, biz.id, 'viewer');
  });

  test('staff capture and edit records but cannot void them (FR-B26)', async () => {
    const sale = await asUser(db, staff.id, async (tx) => (await insertSale(tx, biz.id)).rows[0]);
    await asUser(db, staff.id, (tx) =>
      tx.query('update records.sales_transactions set quantity = 3 where id = $1', [sale.id]),
    );
    await assert.rejects(
      asUser(db, staff.id, (tx) => tx.query(`select records.void_sale($1, 'x')`, [sale.id])),
      /do not have permission/,
    );
  });

  test('viewers read but cannot write', async () => {
    const { rows } = await asUser(db, viewer.id, (tx) => tx.query('select id from records.sales_transactions'));
    assert.ok(rows.length > 0);
    await assert.rejects(asUser(db, viewer.id, (tx) => insertSale(tx, biz.id)), /row-level security/);
  });

  test('staff cannot manage products or members', async () => {
    await assert.rejects(
      asUser(db, staff.id, (tx) =>
        tx.query(`insert into records.products (business_id, name, unit, selling_price) values ($1, 'X', 'u', 1)`, [biz.id]),
      ),
      /row-level security/,
    );
    await assert.rejects(
      asUser(db, staff.id, (tx) => tx.query(`select * from business.invite_member($1, 'x@y.z', 'staff')`, [biz.id])),
      /do not have permission/,
    );
  });

  test('the owner cannot be removed, and ownership cannot be granted', async () => {
    await assert.rejects(
      asUser(db, owner.id, (tx) => tx.query('select business.remove_member($1, $2)', [biz.id, owner.id])),
      /cannot be removed/,
    );
    await assert.rejects(
      asUser(db, owner.id, (tx) => tx.query(`select business.change_member_role($1, $2, 'owner')`, [biz.id, staff.id])),
      /Ownership cannot be assigned/,
    );
  });

  test('a removed member immediately loses access', async () => {
    const former = await createUser(db);
    await addMember(db, owner.id, former, biz.id, 'staff');
    await asUser(db, owner.id, (tx) => tx.query('select business.remove_member($1, $2)', [biz.id, former.id]));
    const { rows } = await asUser(db, former.id, (tx) => tx.query('select id from records.sales_transactions'));
    assert.equal(rows.length, 0);
  });

  test('an invitation can only be accepted by the invited email address', async () => {
    const invited = await createUser(db);
    const stranger = await createUser(db);
    const invitation = await asUser(db, owner.id, async (tx) => {
      const { rows } = await tx.query(`select * from business.invite_member($1, $2, 'staff')`, [biz.id, invited.email]);
      return rows[0];
    });
    await assert.rejects(
      asUser(db, stranger.id, (tx) => tx.query('select business.respond_to_invitation($1, true)', [invitation.id])),
      /no longer available/,
    );
  });

  test('suspended users and deactivated businesses lose operational access (FR-A26, FR-B12)', async () => {
    const bizOwner = await createUser(db);
    const other = await registerBusiness(db, bizOwner.id);
    await asUser(db, bizOwner.id, (tx) => insertSale(tx, other.id));

    await asUser(db, bizOwner.id, (tx) => tx.query(`select business.set_business_status($1, 'deactivated')`, [other.id]));
    await assert.rejects(asUser(db, bizOwner.id, (tx) => insertSale(tx, other.id)), /row-level security/);
    await asUser(db, bizOwner.id, (tx) => tx.query(`select business.set_business_status($1, 'active')`, [other.id]));

    await db.query(`update identity.profiles set account_status = 'suspended' where id = $1`, [bizOwner.id]);
    const { rows } = await asUser(db, bizOwner.id, (tx) => tx.query('select id from records.sales_transactions'));
    assert.equal(rows.length, 0);
  });

  test('platform administrators read configuration changes, ordinary users cannot write it', async () => {
    await assert.rejects(
      asUser(db, owner.id, (tx) => tx.query(`update platform.industries set name = 'Hacked' where code = 'retail'`)).then((r) => {
        assert.equal(r.affectedRows, 0);
        throw new Error('no rows changed');
      }),
      /no rows changed/,
    );
    const admin = await createUser(db);
    await grantPlatformRole(db, admin.id, 'administrator');
    const result = await asUser(db, admin.id, (tx) =>
      tx.query(`update platform.industries set chart_title = 'Sales' where code = 'retail'`),
    );
    assert.equal(result.affectedRows, 1);
  });
});

describe('record integrity', () => {
  let db, owner, biz;

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db);
    biz = await registerBusiness(db, owner.id);
  });

  test('the total is always quantity x unit price (FR-C21)', async () => {
    const { rows } = await asUser(db, owner.id, (tx) => insertSale(tx, biz.id, { quantity: 1.5, price: 42 }));
    assert.equal(Number(rows[0].total_amount), 63);
    await assert.rejects(
      asUser(db, owner.id, (tx) =>
        tx.query('update records.sales_transactions set total_amount = 1 where id = $1', [rows[0].id]),
      ),
      /permission denied|can only be updated to DEFAULT/,
    );
  });

  test('sales and expenses can be voided but never deleted', async () => {
    const { rows } = await asUser(db, owner.id, (tx) => insertSale(tx, biz.id));
    await assert.rejects(
      asUser(db, owner.id, (tx) => tx.query('delete from records.sales_transactions where id = $1', [rows[0].id])),
      /permission denied/,
    );
    await asUser(db, owner.id, (tx) => tx.query(`select records.void_sale($1, 'Mistake')`, [rows[0].id]));
    const voided = (await db.query('select status, void_reason, voided_by from records.sales_transactions where id = $1', [rows[0].id])).rows[0];
    assert.deepEqual(voided, { status: 'voided', void_reason: 'Mistake', voided_by: owner.id });
  });

  test('a voided sale cannot be edited or voided again', async () => {
    const { rows } = await asUser(db, owner.id, (tx) => insertSale(tx, biz.id));
    await asUser(db, owner.id, (tx) => tx.query(`select records.void_sale($1, 'x')`, [rows[0].id]));
    const edit = await asUser(db, owner.id, (tx) =>
      tx.query('update records.sales_transactions set quantity = 9 where id = $1', [rows[0].id]),
    );
    assert.equal(edit.affectedRows, 0);
    await assert.rejects(
      asUser(db, owner.id, (tx) => tx.query(`select records.void_sale($1, 'x')`, [rows[0].id])),
      /already been voided/,
    );
  });

  test('every change is attributed and audited, and the audit log is read-only (FR-C10, FR-C11)', async () => {
    const { rows } = await asUser(db, owner.id, (tx) => insertSale(tx, biz.id));
    await asUser(db, owner.id, (tx) => tx.query('update records.sales_transactions set quantity = 5 where id = $1', [rows[0].id]));
    assert.equal(rows[0].created_by, owner.id);

    const log = await asUser(db, owner.id, async (tx) => (await tx.query(
      `select action, actor_id, old_data ->> 'quantity' as before, new_data ->> 'quantity' as after
         from audit.record_changes where record_id = $1 order by id`,
      [rows[0].id],
    )).rows);
    assert.deepEqual(log.map((l) => l.action), ['INSERT', 'UPDATE']);
    assert.equal(log[1].actor_id, owner.id);
    assert.equal(Number(log[1].after), 5);

    await assert.rejects(
      asUser(db, owner.id, (tx) => tx.query('delete from audit.record_changes where record_id = $1', [rows[0].id])),
      /permission denied/,
    );
  });

  test('a product with sales cannot be deleted, only deactivated (FR-C35)', async () => {
    const product = await asUser(db, owner.id, async (tx) => {
      const { rows } = await tx.query(
        `insert into records.products (business_id, name, unit, selling_price) values ($1, 'Tray', 'tray', 42) returning id`,
        [biz.id],
      );
      await tx.query(
        `insert into records.sales_transactions (business_id, occurred_on, product_id, item_name, category, quantity, unit_price)
         values ($1, '2026-10-01', $2, 'Tray', 'Egg sales', 1, 42)`,
        [biz.id, rows[0].id],
      );
      return rows[0];
    });
    await assert.rejects(
      asUser(db, owner.id, (tx) => tx.query('delete from records.products where id = $1', [product.id])),
      /foreign key/,
    );
    const result = await asUser(db, owner.id, (tx) =>
      tx.query('update records.products set is_active = false where id = $1', [product.id]),
    );
    assert.equal(result.affectedRows, 1);
  });

  test('activity types are limited to the business industry and its rules (FR-I08)', async () => {
    const retailType = await activityTypeId(db, 'retail', 'stock_received');
    const eggType = await activityTypeId(db, 'poultry', 'eggs_collected');
    await assert.rejects(
      asUser(db, owner.id, (tx) => recordActivity(tx, biz.id, retailType, '2026-10-01', 5)),
      /not available for this type of business/,
    );
    await assert.rejects(
      asUser(db, owner.id, (tx) => recordActivity(tx, biz.id, eggType, '2026-10-01', -5)),
      /cannot be negative/,
    );
  });

  test('the industry cannot change once operational records exist (FR-B09)', async () => {
    const eggType = await activityTypeId(db, 'poultry', 'eggs_collected');
    await asUser(db, owner.id, (tx) => recordActivity(tx, biz.id, eggType, '2026-10-02', 5));
    await assert.rejects(
      asUser(db, owner.id, (tx) => tx.query(`update business.businesses set industry_code = 'retail' where id = $1`, [biz.id])),
      /cannot change once operational records exist/,
    );
  });
});
