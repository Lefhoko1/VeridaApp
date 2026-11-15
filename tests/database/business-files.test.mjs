// Receipts, product photos and logos: a file is never more visible than the record it belongs to.
import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { activityTypeId, addMember, asUser, createDatabase, createUser, grantPlatformRole, registerBusiness } from './harness.mjs';

const upload = (tx, name) =>
  tx.query(`insert into storage.objects (bucket_id, name) values ('business-files', $1) returning name`, [name]);
const visible = async (tx, name) =>
  (await tx.query(`select 1 from storage.objects where bucket_id = 'business-files' and name = $1`, [name])).rows.length;

describe('business files', () => {
  let db, owner, staff, viewer, stranger, admin, biz, other;

  before(async () => {
    db = await createDatabase();
    owner = await createUser(db, { name: 'Owner' });
    staff = await createUser(db, { name: 'Staff' });
    viewer = await createUser(db, { name: 'Viewer' });
    stranger = await createUser(db, { name: 'Stranger' });
    admin = await createUser(db, { name: 'Admin' });
    await grantPlatformRole(db, admin.id, 'administrator');
    biz = await registerBusiness(db, owner.id, { name: 'Farm' });
    other = await registerBusiness(db, stranger.id, { name: 'Other' });
    await addMember(db, owner.id, staff, biz.id, 'staff');
    await addMember(db, owner.id, viewer, biz.id, 'viewer');
  });

  test('the bucket is private', async () => {
    const { rows } = await db.query(`select public from storage.buckets where id = 'business-files'`);
    assert.equal(rows[0].public, false);
  });

  test('the owner can add a receipt, a product photo and the logo', async () => {
    await asUser(db, owner.id, async (tx) => {
      await upload(tx, `${biz.id}/receipts/owner.jpg`);
      await upload(tx, `${biz.id}/products/eggs.jpg`);
      await upload(tx, `${biz.id}/logo/logo.png`);
    });
  });

  test('staff can add receipts but not product photos or the logo', async () => {
    await asUser(db, staff.id, (tx) => upload(tx, `${biz.id}/receipts/staff.jpg`));
    await assert.rejects(asUser(db, staff.id, (tx) => upload(tx, `${biz.id}/products/staff.jpg`)), /row-level security/);
    await assert.rejects(asUser(db, staff.id, (tx) => upload(tx, `${biz.id}/logo/staff.png`)), /row-level security/);
  });

  test('a viewer can see files but not add them', async () => {
    assert.equal(await asUser(db, viewer.id, (tx) => visible(tx, `${biz.id}/receipts/owner.jpg`)), 1);
    await assert.rejects(asUser(db, viewer.id, (tx) => upload(tx, `${biz.id}/receipts/viewer.jpg`)), /row-level security/);
  });

  test('nobody outside the business can see or add its files', async () => {
    assert.equal(await asUser(db, stranger.id, (tx) => visible(tx, `${biz.id}/receipts/owner.jpg`)), 0);
    await assert.rejects(asUser(db, stranger.id, (tx) => upload(tx, `${biz.id}/receipts/intruder.jpg`)), /row-level security/);
  });

  test('a file outside the expected layout is refused', async () => {
    await assert.rejects(asUser(db, owner.id, (tx) => upload(tx, `${biz.id}/elsewhere/file.jpg`)), /row-level security/);
    await assert.rejects(asUser(db, owner.id, (tx) => upload(tx, `not-a-business/receipts/file.jpg`)), /row-level security/);
  });

  test('a record can point only at a receipt in its own business', async () => {
    await asUser(db, owner.id, async (tx) => {
      const { rows } = await tx.query(
        `insert into records.expenses (business_id, occurred_on, category, description, amount, receipt_paths)
         values ($1, '2026-11-01', 'Feed', 'Layer mash', 120, $2) returning receipt_paths`,
        [biz.id, [`${biz.id}/receipts/owner.jpg`, `${biz.id}/receipts/staff.jpg`]],
      );
      assert.deepEqual(rows[0].receipt_paths, [`${biz.id}/receipts/owner.jpg`, `${biz.id}/receipts/staff.jpg`]);
    });
    await assert.rejects(
      asUser(db, owner.id, (tx) =>
        tx.query(
          `insert into records.expenses (business_id, occurred_on, category, description, amount, receipt_paths)
           values ($1, '2026-11-01', 'Feed', 'Layer mash', 120, $2)`,
          [biz.id, [`${biz.id}/receipts/owner.jpg`, `${other.id}/receipts/theirs.jpg`]],
        ),
      ),
      /check constraint/,
    );
  });

  test('a record holds at most ten receipts', async () => {
    const eleven = Array.from({ length: 11 }, (_, index) => `${biz.id}/receipts/${index}.jpg`);
    await assert.rejects(
      asUser(db, owner.id, (tx) =>
        tx.query(
          `insert into records.expenses (business_id, occurred_on, category, description, amount, receipt_paths)
           values ($1, '2026-11-01', 'Feed', 'Layer mash', 120, $2)`,
          [biz.id, eleven],
        ),
      ),
      /check constraint/,
    );
  });

  test('sales, activities, products and the business accept their own files', async () => {
    const typeId = await activityTypeId(db, 'poultry', 'eggs_collected');
    await asUser(db, owner.id, async (tx) => {
      await tx.query(
        `insert into records.sales_transactions (business_id, occurred_on, item_name, category, quantity, unit_price, receipt_paths)
         values ($1, '2026-11-01', 'Eggs', 'Egg sales', 2, 40, $2)`,
        [biz.id, [`${biz.id}/receipts/owner.jpg`]],
      );
      await tx.query(
        `insert into operations.activity_records (business_id, activity_type_id, occurred_on, quantity, unit, receipt_paths)
         values ($1, $2, '2026-11-01', 30, 'eggs', $3)`,
        [biz.id, typeId, [`${biz.id}/receipts/owner.jpg`]],
      );
      await tx.query(
        `insert into records.products (business_id, kind, name, unit, selling_price, image_path)
         values ($1, 'product', 'Tray of eggs', 'tray', 60, $2)`,
        [biz.id, `${biz.id}/products/eggs.jpg`],
      );
      await tx.query(`update business.businesses set logo_path = $2 where id = $1`, [biz.id, `${biz.id}/logo/logo.png`]);
    });
    await assert.rejects(
      asUser(db, owner.id, (tx) =>
        tx.query(`update business.businesses set logo_path = $2 where id = $1`, [biz.id, `${biz.id}/receipts/owner.jpg`]),
      ),
      /check constraint/,
    );
  });

  test('staff who process deletions can list and remove a business\'s files', async () => {
    const removed = await asUser(db, admin.id, async (tx) => {
      assert.equal(await visible(tx, `${biz.id}/receipts/staff.jpg`), 1);
      return (await tx.query(`delete from storage.objects where name = $1 returning name`, [`${biz.id}/receipts/staff.jpg`])).rows;
    });
    assert.equal(removed.length, 1);
  });
});
