/**
 * @jest-environment node
 *
 * The real repositories against a real Supabase project. Skipped unless LIVE_ACCOUNTS_FILE is set,
 * because it writes to that project. It needs two existing verified accounts, and it never calls
 * anything that sends email. The review test also needs LIVE_REVIEWER=1 (see below).
 *
 * Everything it creates is named "LIVE TEST". tests/integration/live-cleanup.sql removes it.
 *
 *   LIVE_ACCOUNTS_FILE=accounts.json LIVE_SUPABASE_URL=... LIVE_SUPABASE_KEY=... npx jest live-supabase
 *
 * accounts.json is [{ "email": "...", "password": "..." }, { ... }]. Keep it out of the project.
 */
import { readFileSync } from 'node:fs';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { SupabaseAuthRepository } from '@/modules/account/data/SupabaseAuthRepository';
import { SupabaseProfileRepository } from '@/modules/account/data/SupabaseProfileRepository';
import { SupabaseBusinessAdminRepository, SupabaseDeletionRepository, SupabaseRoleRepository, SupabaseUserAdminRepository } from '@/modules/administration/data/SupabaseAdminRepositories';
import { SupabaseAnalyticsRepository } from '@/modules/analytics/data/SupabaseAnalyticsRepository';
import { SupabaseConversationRepository } from '@/modules/assistant/data/SupabaseConversationRepository';
import { SupabaseBusinessRepository } from '@/modules/business/data/SupabaseBusinessRepository';
import { SupabaseMembershipRepository } from '@/modules/business/data/SupabaseMembershipRepository';
import type { BusinessDetails } from '@/modules/business/domain/models';
import { SupabaseLearnerProfileRepository, SupabaseLessonRepository, SupabaseLessonReviewRepository } from '@/modules/learning/data/SupabaseLearningRepositories';
import { SupabaseNotificationRepository } from '@/modules/notifications/data/SupabaseNotificationRepository';
import { SupabaseActivityRepository } from '@/modules/operations/data/SupabaseActivityRepository';
import { SupabaseFlockRepository } from '@/modules/operations/data/SupabaseFlockRepository';
import { SupabaseExpenseRepository } from '@/modules/records/data/SupabaseExpenseRepository';
import { SupabaseCategoryRepository, SupabaseProductRepository } from '@/modules/records/data/SupabaseProductRepository';
import { SupabaseSalesRepository } from '@/modules/records/data/SupabaseSalesRepository';

const { LIVE_ACCOUNTS_FILE, LIVE_SUPABASE_URL, LIVE_SUPABASE_KEY } = process.env;
const describeLive = LIVE_ACCOUNTS_FILE ? describe : describe.skip;
// Set LIVE_REVIEWER=1 once the second account holds the learning_reviewer role.
const itWithReviewer = process.env.LIVE_REVIEWER ? it : it.skip;

const RANGE = { from: '2026-10-01', to: '2026-10-31' };
const DETAILS: BusinessDetails = {
  name: 'LIVE TEST Farm',
  industryCode: 'poultry',
  stage: 'Already operating',
  size: 'Small-scale',
  country: 'Botswana',
  location: 'Gaborone',
  currency: 'BWP',
  mainGoal: 'Understand overall performance',
  recordKeeping: 'Mostly manual records', additionalIndustries: [], otherType: null
};
const SALE = { occurredOn: '2026-10-05', productId: null, itemName: 'LIVE TEST eggs', category: 'Egg sales', quantity: 1.5, unit: 'trays', unitPrice: 42, notes: 'Market day' };

type Account = { email: string; password: string; client: SupabaseClient; userId: string };

const newClient = () => createClient(LIVE_SUPABASE_URL ?? '', LIVE_SUPABASE_KEY ?? '', { auth: { persistSession: false, autoRefreshToken: false } });

async function signIn({ email, password }: { email: string; password: string }): Promise<Account> {
  const client = newClient();
  const auth = new SupabaseAuthRepository(client);
  await auth.signIn(email, password);
  const session = await auth.getSession();
  return { email, password, client, userId: session?.userId ?? '' };
}

describeLive('live Supabase project', () => {
  let one: Account;
  let two: Account;
  let farm: string;
  let shop: string;
  let saleId: string;

  beforeAll(async () => {
    const accounts = JSON.parse(readFileSync(LIVE_ACCOUNTS_FILE ?? '', 'utf8'));
    [one, two] = await Promise.all([signIn(accounts[0]), signIn(accounts[1])]);
    farm = await new SupabaseBusinessRepository(one.client).register(DETAILS);
    shop = await new SupabaseBusinessRepository(two.client).register({ ...DETAILS, name: 'LIVE TEST Shop', industryCode: 'retail' });
  }, 60_000);

  describe('account', () => {
    it('rejects wrong credentials readably', async () => {
      await expect(new SupabaseAuthRepository(newClient()).signIn(one.email, 'Wrong-password-1')).rejects.toThrow('That email or password is not correct.');
    });

    it('reads and updates a profile', async () => {
      const profiles = new SupabaseProfileRepository(one.client);
      const before = await profiles.getProfile(one.userId);
      expect(before).toMatchObject({ email: one.email, accountStatus: 'active' });
      expect(await profiles.updateProfile(one.userId, { fullName: before.fullName, phone: '+267 7000' })).toMatchObject({ phone: '+267 7000' });
      await profiles.updateProfile(one.userId, { fullName: before.fullName, phone: before.phone });
    });

    it('survives a sign-out and sign-in, then restores access', async () => {
      const again = await signIn({ email: one.email, password: one.password });
      await new SupabaseAuthRepository(again.client).signOut();
      expect(await new SupabaseAuthRepository(again.client).getSession()).toBeNull();
    });
  });

  describe('people and permissions', () => {
    // Safe to attempt: the account has just registered a running business, so it must be refused.
    it('refuses to let an owner leave while their business is running', async () => {
      const { error } = await one.client.schema('identity').rpc('deactivate_account');
      expect(error?.message).toContain('still owns');
      expect((await new SupabaseProfileRepository(one.client).getProfile(one.userId)).accountStatus).toBe('active');
    });

    it('gives an ordinary account no Verida permissions, and refuses staff functions', async () => {
      expect(await new SupabaseRoleRepository(one.client).myPermissions()).toEqual([]);
      await expect(new SupabaseDeletionRepository(one.client).queue()).rejects.toMatchObject({ code: 'forbidden' });
      await expect(new SupabaseUserAdminRepository(one.client).search({})).rejects.toMatchObject({ code: 'forbidden' });
      await expect(new SupabaseBusinessAdminRepository(one.client).listMembers(farm)).rejects.toMatchObject({ code: 'forbidden' });
      await expect(new SupabaseRoleRepository(one.client).staffPermissions(one.userId)).rejects.toMatchObject({ code: 'forbidden' });
    });

    it('lets people read their own permissions, and not another business\'s', async () => {
      const mine = await new SupabaseMembershipRepository(one.client).memberPermissions(farm, one.userId);
      expect(mine.every((item) => item.allowed)).toBe(true);
      await expect(new SupabaseMembershipRepository(two.client).memberPermissions(farm, one.userId)).rejects.toMatchObject({ code: 'forbidden' });
    });

    it('refuses to change your own permissions, or anyone\'s in another business', async () => {
      await expect(new SupabaseMembershipRepository(one.client).setMemberPermission(farm, one.userId, 'records.void', false)).rejects.toMatchObject({ code: 'conflict' });
      await expect(new SupabaseMembershipRepository(two.client).setMemberPermission(farm, one.userId, 'records.void', false)).rejects.toMatchObject({ code: 'forbidden' });
      await expect(new SupabaseMembershipRepository(two.client).transferOwnership(farm, two.userId)).rejects.toMatchObject({ code: 'forbidden' });
    });

    it('reads the configurable activity rules', async () => {
      const [type] = await new SupabaseActivityRepository(one.client).listTypes(['poultry']);
      expect(type).toMatchObject({ wholeNumbersOnly: false, notesRequired: false, allowedUnits: [] });
    });

    it('can read lesson activities and answers, which are empty for an unknown lesson', async () => {
      expect(await new SupabaseLessonRepository(one.client).listActivities('00000000-0000-0000-0000-000000000000')).toEqual([]);
    });
  });

  describe('business', () => {
    it('lists all six industries', async () => {
      const industries = await new SupabaseBusinessRepository(one.client).listIndustries();
      expect(industries.map((i) => i.code)).toEqual(['poultry', 'retail', 'salon', 'food', 'professional', 'other']);
    });

    it('makes the creator the owner, with the full details', async () => {
      const repository = new SupabaseBusinessRepository(one.client);
      const workspace = (await repository.listWorkspaces()).find((w) => w.id === farm);
      expect(workspace).toMatchObject({ ...DETAILS, status: 'active', myRole: 'owner' });
      expect(await repository.listPermissions(farm)).toEqual(expect.arrayContaining(['business.manage', 'records.void', 'analytics.view']));
    });

    it('updates the profile', async () => {
      const repository = new SupabaseBusinessRepository(one.client);
      await repository.update(farm, { ...DETAILS, location: 'Francistown' });
      expect((await repository.listWorkspaces()).find((w) => w.id === farm)?.location).toBe('Francistown');
    });
  });

  describe('records', () => {
    it('captures a sale, with the total calculated by the database', async () => {
      const sales = new SupabaseSalesRepository(one.client);
      await sales.create(farm, SALE);
      const [created] = await sales.list(farm, {});
      saleId = created!.id;
      expect(created).toMatchObject({ ...SALE, totalAmount: 63, status: 'recorded' });
    });

    it('searches and filters on the real API, including hostile search terms', async () => {
      const sales = new SupabaseSalesRepository(one.client);
      expect(await sales.list(farm, { search: 'market' })).toHaveLength(1);
      expect(await sales.list(farm, { search: 'nothing-matches' })).toHaveLength(0);
      expect(await sales.list(farm, { categories: ['Egg sales'], from: '2026-10-01', to: '2026-10-31' })).toHaveLength(1);
      expect(await sales.list(farm, { to: '2026-09-30' })).toHaveLength(0);
      await expect(sales.list(farm, { search: 'x%,status.eq.voided),(item_name.ilike.%' })).resolves.toEqual([]);
    });

    it('edits a sale and recalculates its total', async () => {
      const sales = new SupabaseSalesRepository(one.client);
      await sales.update(saleId, { ...SALE, quantity: 2 });
      expect((await sales.get(saleId)).totalAmount).toBe(84);
    });

    it('handles expenses, with nullable numbers intact', async () => {
      const expenses = new SupabaseExpenseRepository(one.client);
      await expenses.create(farm, { occurredOn: '2026-10-05', category: 'Feed', description: 'LIVE TEST mash', amount: 34, quantity: null, unit: null, certainty: 'recorded', notes: null });
      const [created] = await expenses.list(farm, { search: 'mash' });
      expect(created).toMatchObject({ amount: 34, quantity: null, certainty: 'recorded' });
      const toVoid = await expenses.list(farm, {});
      expect(toVoid).toHaveLength(1);
    });

    it('manages products, and refuses to delete one with sales', async () => {
      const products = new SupabaseProductRepository(one.client);
      const input = { kind: 'product' as const, name: 'LIVE TEST tray', category: null, description: null, unit: 'tray', sellingPrice: 45 };
      await products.create(farm, input);
      const [product] = await products.list(farm, 'tray');
      await expect(products.create(farm, input)).rejects.toMatchObject({ code: 'conflict', message: 'This already exists.' });

      await new SupabaseSalesRepository(one.client).create(farm, { ...SALE, occurredOn: '2026-09-15', productId: product!.id });
      await expect(products.remove(product!.id)).rejects.toMatchObject({ code: 'conflict', message: 'This is still used by other records, so it cannot be removed.' });

      await products.setActive(product!.id, false);
      expect((await products.get(product!.id)).isActive).toBe(false);
    });

    it('merges industry categories with a custom one', async () => {
      const categories = new SupabaseCategoryRepository(one.client);
      await categories.add(farm, 'expense', 'LIVE TEST vet');
      expect(await categories.list(farm, 'expense')).toEqual(expect.arrayContaining(['Feed', 'LIVE TEST vet']));
    });
  });

  describe('operations and analytics', () => {
    it('produces the worked example from real records: 48 eggs / 60 hens = 80%', async () => {
      const activities = new SupabaseActivityRepository(one.client);
      const types = await activities.listTypes(['poultry']);
      const typeId = (code: string) => types.find((t) => t.code === code)!.id;
      const flocks = new SupabaseFlockRepository(one.client);
      await flocks.create(farm, { name: 'LIVE TEST house', breed: null, acquiredOn: '2026-01-15', initialCount: 60 });
      const [flock] = await flocks.list(farm);

      const record = (code: string, quantity: number, unit: string) =>
        activities.create(farm, { activityTypeId: typeId(code), occurredOn: '2026-10-05', quantity, unit, flockId: flock!.id, notes: null });
      await record('eggs_collected', 48, 'eggs');
      await record('eggs_rejected', 3, 'eggs');
      await record('flock_count', 60, 'hens');
      await record('feed_used', 7.2, 'kg');

      const analytics = new SupabaseAnalyticsRepository(one.client);
      const kpis = Object.fromEntries((await analytics.computeKpis(farm, RANGE)).map((kpi) => [kpi.code, kpi]));
      expect(kpis.revenue).toMatchObject({ value: 84, status: 'actual', unit: 'money' });
      expect(kpis.expenses).toMatchObject({ value: 34, status: 'actual' });
      expect(kpis.recorded_balance).toMatchObject({ value: 50, status: 'estimated' });
      expect(kpis.hen_day_rate).toMatchObject({ value: 80, status: 'actual' });
      expect(kpis.usable_eggs?.value).toBe(45);
      expect(kpis.feed_per_egg?.value).toBe(150);
      expect(kpis.flock_size?.value).toBe(60);

      expect(await analytics.monthlySeries(farm, 6)).toHaveLength(6);
      expect((await analytics.recentActivity(farm, 3)).length).toBe(3);
      expect((await analytics.dataCompleteness(farm, RANGE)).find((item) => item.item === 'operations')?.isStarted).toBe(true);
    });

    it('computes expected stock from the latest count', async () => {
      const activities = new SupabaseActivityRepository(two.client);
      const types = await activities.listTypes(['retail']);
      const typeId = (code: string) => types.find((t) => t.code === code)!.id;
      await activities.create(shop, { activityTypeId: typeId('stock_count'), occurredOn: '2026-10-01', quantity: 500, unit: 'items', flockId: null, notes: null });
      await activities.create(shop, { activityTypeId: typeId('stock_received'), occurredOn: '2026-10-02', quantity: 100, unit: 'items', flockId: null, notes: null });
      await new SupabaseSalesRepository(two.client).create(shop, { ...SALE, category: 'Product sales', occurredOn: '2026-10-03', quantity: 40 });
      const kpis = await new SupabaseAnalyticsRepository(two.client).computeKpis(shop, RANGE);
      expect(kpis.find((k) => k.code === 'expected_stock')).toMatchObject({ value: 560, status: 'actual' });
    });

    it('rejects an activity from another industry with a readable message', async () => {
      const activities = new SupabaseActivityRepository(one.client);
      const [retailType] = await activities.listTypes(['retail']);
      await expect(activities.create(farm, { activityTypeId: retailType!.id, occurredOn: '2026-10-05', quantity: 1, unit: 'items', flockId: null, notes: null })).rejects.toMatchObject({
        code: 'validation',
        message: 'This activity is not available for this type of business.',
      });
    });

    it('voids a sale, which removes it from reports but keeps it in history', async () => {
      const sales = new SupabaseSalesRepository(one.client);
      const extra = { ...SALE, occurredOn: '2026-10-06', itemName: 'LIVE TEST mistake', quantity: 100 };
      await sales.create(farm, extra);
      const [mistake] = await sales.list(farm, { search: 'mistake' });
      await sales.void(mistake!.id, 'Entered by mistake');
      expect(await sales.get(mistake!.id)).toMatchObject({ status: 'voided', voidReason: 'Entered by mistake' });
      const kpis = await new SupabaseAnalyticsRepository(one.client).computeKpis(farm, RANGE);
      expect(kpis.find((k) => k.code === 'revenue')?.value).toBe(84);
      await expect(sales.void(mistake!.id, 'Again')).rejects.toMatchObject({ code: 'conflict' });
    });
  });

  describe('isolation between businesses', () => {
    it('hides one business from the other through every repository', async () => {
      expect((await new SupabaseBusinessRepository(two.client).listWorkspaces()).map((w) => w.id)).not.toContain(farm);
      expect(await new SupabaseSalesRepository(two.client).list(farm, {})).toEqual([]);
      expect(await new SupabaseExpenseRepository(two.client).list(farm, {})).toEqual([]);
      expect(await new SupabaseProductRepository(two.client).list(farm)).toEqual([]);
      expect(await new SupabaseFlockRepository(two.client).list(farm)).toEqual([]);
      expect(await new SupabaseActivityRepository(two.client).list(farm, {})).toEqual([]);
    });

    it('refuses to write into another business', async () => {
      await expect(new SupabaseSalesRepository(two.client).create(farm, SALE)).rejects.toMatchObject({ code: 'forbidden' });
      await expect(new SupabaseMembershipRepository(two.client).invite(farm, 'x@example.com', 'staff')).rejects.toMatchObject({ code: 'forbidden' });
    });

    it('refuses analytics for another business rather than returning empty results', async () => {
      await expect(new SupabaseAnalyticsRepository(two.client).computeKpis(farm, RANGE)).rejects.toMatchObject({ code: 'forbidden' });
      await expect(new SupabaseAnalyticsRepository(two.client).recentActivity(farm, 5)).rejects.toMatchObject({ code: 'forbidden' });
    });

    it('resists requests made directly, bypassing the repositories', async () => {
      const db = two.client.schema('records');
      const update = await db.from('sales_transactions').update({ quantity: 999 }).eq('id', saleId).select('id');
      expect(update.data ?? []).toEqual([]);
      await db.from('sales_transactions').delete().eq('id', saleId);
      expect((await new SupabaseSalesRepository(one.client).get(saleId)).quantity).toBe(2);

      const others = await two.client.schema('identity').from('profiles').select('id').eq('id', one.userId);
      expect(others.data).toEqual([]);
    });

    it('protects columns and internal functions, even from the owner', async () => {
      const status = await one.client.schema('records').from('sales_transactions').update({ status: 'voided' }).eq('id', saleId);
      expect(status.error?.code).toBe('42501');
      const account = await one.client.schema('identity').from('profiles').update({ account_status: 'suspended' }).eq('id', one.userId);
      expect(account.error?.code).toBe('42501');
      const remove = await one.client.schema('records').from('sales_transactions').delete().eq('id', saleId);
      expect(remove.error?.code).toBe('42501');
      const internal = await one.client.schema('notifications').rpc('deliver', { p_user_id: two.userId, p_type: 'account', p_title: 'x', p_body: 'y' });
      expect(internal.error).toBeTruthy();
      const auditSchema = await one.client.schema('audit').from('record_changes').select('id');
      expect(auditSchema.error).toBeTruthy();
    });

    it('gives logged-out visitors nothing', async () => {
      const anon = newClient();
      for (const [schema, table] of [['records', 'sales_transactions'], ['identity', 'profiles'], ['business', 'businesses'], ['platform', 'industries']] as const) {
        const result = await anon.schema(schema).from(table).select('*').limit(1);
        expect(result.error?.code).toBe('42501');
      }
      expect((await anon.schema('business').rpc('my_workspaces')).error).toBeTruthy();
    });
  });

  describe('team membership', () => {
    it('runs the whole lifecycle, with permissions following the role', async () => {
      const owner = new SupabaseMembershipRepository(one.client);
      const invitee = new SupabaseMembershipRepository(two.client);

      await owner.invite(farm, two.email, 'staff');
      expect(await owner.listSentInvitations(farm)).toEqual([expect.objectContaining({ email: two.email, role: 'staff' })]);

      const inbox = await new SupabaseNotificationRepository(two.client).list();
      expect(inbox.some((n) => n.type === 'invitation')).toBe(true);

      const received = (await invitee.listReceivedInvitations()).find((i) => i.businessName === 'LIVE TEST Farm');
      await invitee.respondToInvitation(received!.id, true);

      const roles = (await owner.listMembers(farm)).map((m) => m.role);
      expect(roles).toEqual(['owner', 'staff']);

      const staffSales = new SupabaseSalesRepository(two.client);
      expect((await staffSales.list(farm, {})).length).toBeGreaterThan(0);
      await staffSales.create(farm, { ...SALE, occurredOn: '2026-10-07', itemName: 'LIVE TEST by staff' });
      await expect(staffSales.void(saleId, 'nope')).rejects.toMatchObject({ code: 'forbidden' });

      await owner.changeRole(farm, two.userId, 'viewer');
      await expect(staffSales.create(farm, SALE)).rejects.toMatchObject({ code: 'forbidden' });

      await owner.removeMember(farm, two.userId);
      expect(await staffSales.list(farm, {})).toEqual([]);
      await expect(owner.removeMember(farm, one.userId)).rejects.toMatchObject({ code: 'conflict' });
    });
  });

  describe('learning', () => {
    it('keeps a draft from its learner, and from anyone who is not a reviewer', async () => {
      const lessons = new SupabaseLessonRepository(one.client);

      await lessons.requestWeeklyLesson(farm);
      const state = await lessons.weeklyState(farm);
      expect(state?.status).toBe('pending_review');
      expect(await lessons.listMine(farm)).toEqual([]);
      await expect(lessons.get(state!.lessonId)).rejects.toMatchObject({ code: 'not_found' });

      expect(await new SupabaseLessonReviewRepository(one.client).canReview()).toBe(false);
      await expect(new SupabaseLessonReviewRepository(one.client).decide(state!.lessonId, 'approve', null)).rejects.toMatchObject({ code: 'forbidden' });
      await expect(new SupabaseLessonRepository(one.client).complete(state!.lessonId, { answer: 'x', rating: 5, feedback: null })).rejects.toMatchObject({ code: 'conflict' });
    });

    itWithReviewer('publishes through review, notifies the learner, and records completion', async () => {
      const lessons = new SupabaseLessonRepository(one.client);
      const reviews = new SupabaseLessonReviewRepository(two.client);
      const state = await lessons.weeklyState(farm);

      expect(await reviews.canReview()).toBe(true);
      const item = (await reviews.list({ status: 'pending_review' })).find((lesson) => lesson.id === state!.lessonId);
      expect(item?.businessContext).toBe('LIVE TEST Farm · Poultry');

      await reviews.edit(item!.id, { title: 'LIVE TEST lesson', intro: 'Intro', example: 'Example', challenge: 'Challenge' });
      await reviews.decide(item!.id, 'approve', 'Good');

      const [published] = await lessons.listMine(farm);
      expect(published).toMatchObject({ title: 'LIVE TEST lesson', status: 'published' });
      expect((await new SupabaseNotificationRepository(one.client).list()).some((n) => n.type === 'lesson')).toBe(true);

      await lessons.complete(published!.id, { answer: 'Done', rating: 5, feedback: null });
      expect((await lessons.get(published!.id)).status).toBe('completed');
    });

    it('stores learner preferences, restoring whatever was there before', async () => {
      const profiles = new SupabaseLearnerProfileRepository(one.client);
      const original = await profiles.get(one.userId);
      const profile = { goals: ['LIVE TEST goal'], topics: ['Profit'], preferredFormat: 'practical' as const };
      await profiles.save(one.userId, profile);
      expect(await profiles.get(one.userId)).toMatchObject(profile);
      await profiles.save(one.userId, original ?? { goals: [], topics: [], preferredFormat: 'reading' });
    });
  });

  describe('assistant and notifications', () => {
    it('keeps conversations private', async () => {
      const conversations = new SupabaseConversationRepository(one.client);
      const id = await conversations.start(farm, 'LIVE TEST chat');
      await conversations.addMessage(id, 'user', 'How are my costs?', null);
      await conversations.addMessage(id, 'assistant', 'Here they are.', 'verified');
      await conversations.logRequest({ businessId: farm, intent: 'kpi:expenses', outcome: 'answered', latencyMs: 12 });
      expect(await conversations.messages(id)).toHaveLength(2);
      expect(await new SupabaseConversationRepository(two.client).messages(id)).toEqual([]);
      await conversations.remove(id);
      expect(await conversations.list(farm)).toEqual([]);
    });

    it('reads notifications and preferences', async () => {
      const notifications = new SupabaseNotificationRepository(two.client);
      expect(Array.isArray(await notifications.list())).toBe(true);
      const original = await notifications.getPreferences();
      await notifications.savePreferences({ ...original, businessUpdates: !original.businessUpdates });
      expect((await notifications.getPreferences()).businessUpdates).toBe(!original.businessUpdates);
      await notifications.savePreferences(original);
    });

    it('sees new columns and functions from the latest migrations', async () => {
      await expect(new SupabaseBusinessRepository(one.client).changeHistory(farm)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ tableName: 'sales_transactions' })]));
      await expect(new SupabaseLessonReviewRepository(one.client).canReview()).resolves.toBe(false);
      const sales = new SupabaseSalesRepository(one.client);
      const base = { ...SALE, itemName: 'LIVE TEST import', occurredOn: '2026-09-20' };
      await sales.createMany(farm, [base, { ...base, quantity: 3 }]);
      expect(await sales.list(farm, { search: 'import' })).toHaveLength(2);
      const denied = await one.client.schema('identity').rpc('admin_search_users');
      expect(denied.error?.code).toBe('42501');
      const outbox = await one.client.schema('notifications').from('outbox').select('id');
      expect(outbox.error?.code).toBe('42501');
    });
  });
});
