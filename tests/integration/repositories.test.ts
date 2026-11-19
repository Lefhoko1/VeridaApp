/**
 * @jest-environment node
 *
 * Runs the real repositories through the real supabase-js client against the real migrations,
 * with RLS enforced. This is what proves that column names, function arguments and response
 * schemas in the data layer match the database.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { SupabaseAuthRepository } from '@/modules/account/data/SupabaseAuthRepository';
import { SupabaseProfileRepository } from '@/modules/account/data/SupabaseProfileRepository';
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
import { SupabasePlanRepository } from '@/modules/plan/data/SupabasePlanRepository';
import { SupabaseSalesRepository } from '@/modules/records/data/SupabaseSalesRepository';

const CODE = '123456';
const PASSWORD = 'Verida2026';
const RANGE = { from: '2026-10-01', to: '2026-10-31' };

let emulator: ChildProcess;
let baseUrl: string;

beforeAll(async () => {
  emulator = spawn(process.execPath, [join(__dirname, 'emulator.mjs'), '--port', '0'], { stdio: ['ignore', 'pipe', 'inherit'] });
  baseUrl = await new Promise<string>((resolve, reject) => {
    emulator.stdout?.on('data', (chunk: Buffer) => {
      const match = /READY (\S+)/.exec(chunk.toString());
      if (match?.[1]) resolve(match[1]);
    });
    emulator.on('exit', (code) => reject(new Error(`Emulator exited early with code ${code}`)));
  });
}, 60_000);

afterAll(() => {
  emulator.removeAllListeners('exit');
  emulator.kill();
});

function newClient(): SupabaseClient {
  return createClient(baseUrl, 'publishable-test-key', { auth: { persistSession: false, autoRefreshToken: false } });
}

let userCounter = 0;

// Signs up and verifies through the public API, as the app does.
async function newUser(name = 'Test User') {
  const client = newClient();
  const auth = new SupabaseAuthRepository(client);
  const email = `user${(userCounter += 1)}-${Date.now()}@verida.test`;
  await auth.signUp({ fullName: name, email, password: PASSWORD });
  await auth.verifySignUp(email, CODE);
  const session = await auth.getSession();
  if (!session) throw new Error('Expected a session after verification');
  return { client, auth, email, userId: session.userId };
}

const DETAILS: BusinessDetails = {
  name: 'Vinabbie AgriSolutions',
  industryCode: 'poultry',
  stage: 'Already operating',
  size: 'Small-scale',
  country: 'Botswana',
  location: 'Gaborone',
  currency: 'BWP',
  mainGoal: 'Understand overall performance',
  recordKeeping: 'Mostly manual records', additionalIndustries: [], otherType: null
};

async function newBusiness(client: SupabaseClient, overrides: Partial<BusinessDetails> = {}) {
  return new SupabaseBusinessRepository(client).register({ ...DETAILS, ...overrides });
}

async function grantRole(email: string, role: string) {
  await fetch(`${baseUrl}/__emulator/grant-role`, { method: 'POST', body: JSON.stringify({ email, role }) });
}

describe('account', () => {
  it('signs up, verifies, signs out and signs back in', async () => {
    const { auth, email, userId } = await newUser('Neo Moeng');
    await auth.signOut();
    expect(await auth.getSession()).toBeNull();

    const fresh = new SupabaseAuthRepository(newClient());
    await fresh.signIn(email, PASSWORD);
    expect((await fresh.getSession())?.userId).toBe(userId);
  });

  it('rejects invalid credentials with a readable message (FR-A10)', async () => {
    const { email } = await newUser();
    await expect(new SupabaseAuthRepository(newClient()).signIn(email, 'Wrong1234')).rejects.toThrow('That email or password is not correct.');
  });

  it('refuses sign-in before verification (FR-A07)', async () => {
    const auth = new SupabaseAuthRepository(newClient());
    const email = `pending-${Date.now()}@verida.test`;
    await auth.signUp({ fullName: 'Pending', email, password: PASSWORD });
    await expect(auth.signIn(email, PASSWORD)).rejects.toThrow('Verify your email address');
  });

  it('rejects a wrong verification code', async () => {
    const auth = new SupabaseAuthRepository(newClient());
    const email = `wrong-code-${Date.now()}@verida.test`;
    await auth.signUp({ fullName: 'X', email, password: PASSWORD });
    await expect(auth.verifySignUp(email, '000000')).rejects.toThrow('incorrect or has expired');
  });

  it('reports an email that is already registered (FR-A03)', async () => {
    const { email } = await newUser();
    await expect(new SupabaseAuthRepository(newClient()).signUp({ fullName: 'X', email, password: PASSWORD })).rejects.toThrow('already exists');
  });

  it('resets a forgotten password using the emailed code (FR-A12 to FR-A14)', async () => {
    const { email } = await newUser();
    const auth = new SupabaseAuthRepository(newClient());
    await auth.requestPasswordReset(email);
    await auth.resetPassword({ email, code: CODE, newPassword: 'NewPassword1' });
    await expect(new SupabaseAuthRepository(newClient()).signIn(email, 'NewPassword1')).resolves.toBeUndefined();
  });

  it('reads and updates the profile (FR-A15, FR-A16, FR-A19)', async () => {
    const { client, userId, email } = await newUser('Neo');
    const profiles = new SupabaseProfileRepository(client);
    expect(await profiles.getProfile(userId)).toMatchObject({ fullName: 'Neo', email, accountStatus: 'active', phone: null });
    expect(await profiles.updateProfile(userId, { fullName: 'Neo M', phone: '+267 7000' })).toMatchObject({ fullName: 'Neo M', phone: '+267 7000' });
  });

  it('changes the email address through verification (FR-A17)', async () => {
    const { auth, client, userId } = await newUser();
    const next = `changed-${Date.now()}@verida.test`;
    await auth.requestEmailChange(next);
    await auth.confirmEmailChange(next, CODE);
    expect((await new SupabaseProfileRepository(client).getProfile(userId)).email).toBe(next);
  });

  it('deactivates an account (FR-A20)', async () => {
    const { client, userId } = await newUser();
    const profiles = new SupabaseProfileRepository(client);
    await profiles.deactivateAccount();
    expect((await profiles.getProfile(userId)).accountStatus).toBe('deactivated');
  });
});

describe('business', () => {
  it('lists the taxonomy: categories, then their types in order', async () => {
    const { client } = await newUser();
    const repository = new SupabaseBusinessRepository(client);
    const categories = await repository.listCategories();
    expect(categories).toHaveLength(10);
    expect(categories[0]).toMatchObject({ code: 'agriculture', name: 'Agriculture & farming' });

    const industries = await repository.listIndustries();
    expect(industries).toHaveLength(87);
    expect(industries.slice(0, 2).map((i) => i.code)).toEqual(['crop_farming', 'poultry']);
    expect(industries.at(-1)).toMatchObject({ code: 'other', categoryCode: 'digital_creative_other' });
    // Every category's types sit together, in the categories' order.
    const order = industries.map((i) => categories.findIndex((c) => c.code === i.categoryCode));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(industries[1]).toMatchObject({ name: 'Poultry', shortName: 'Farm', chartTitle: 'Production and farm activity' });
  });

  it('registers a business and makes the creator its owner (FR-B01 to FR-B05)', async () => {
    const { client } = await newUser();
    const repository = new SupabaseBusinessRepository(client);
    const id = await repository.register(DETAILS);

    const [workspace] = await repository.listWorkspaces();
    expect(workspace).toMatchObject({ ...DETAILS, id, status: 'active', myRole: 'owner' });
    expect(await repository.listPermissions(id)).toEqual(expect.arrayContaining(['business.manage', 'records.void']));
  });

  it('updates the profile and status (FR-B08, FR-B12)', async () => {
    const { client } = await newUser();
    const repository = new SupabaseBusinessRepository(client);
    const id = await repository.register(DETAILS);
    await repository.update(id, { ...DETAILS, name: 'Renamed', location: null });
    await repository.setStatus(id, 'deactivated');
    expect((await repository.listWorkspaces())[0]).toMatchObject({ name: 'Renamed', location: null, status: 'deactivated' });
    expect(await repository.listPermissions(id)).toEqual([]);
  });

  it('runs the invitation and membership lifecycle (FR-B19 to FR-B24)', async () => {
    const owner = await newUser('Owner');
    const staff = await newUser('Staff');
    const id = await newBusiness(owner.client);
    const members = new SupabaseMembershipRepository(owner.client);
    const invitee = new SupabaseMembershipRepository(staff.client);

    await members.invite(id, staff.email, 'staff');
    expect(await members.listSentInvitations(id)).toEqual([expect.objectContaining({ email: staff.email, role: 'staff' })]);

    const [received] = await invitee.listReceivedInvitations();
    expect(received).toMatchObject({ businessName: DETAILS.name, role: 'staff' });
    await invitee.respondToInvitation(received!.id, true);

    expect((await members.listMembers(id)).map((m) => [m.fullName, m.role])).toEqual([['Owner', 'owner'], ['Staff', 'staff']]);
    expect((await new SupabaseBusinessRepository(staff.client).listWorkspaces())[0]?.myRole).toBe('staff');

    await members.changeRole(id, staff.userId, 'viewer');
    expect(await new SupabaseBusinessRepository(staff.client).listPermissions(id)).toEqual(expect.not.arrayContaining(['records.create']));

    await members.removeMember(id, staff.userId);
    expect(await new SupabaseBusinessRepository(staff.client).listWorkspaces()).toEqual([]);
  });

  it('withdraws an invitation', async () => {
    const owner = await newUser();
    const other = await newUser();
    const id = await newBusiness(owner.client);
    const members = new SupabaseMembershipRepository(owner.client);
    await members.invite(id, other.email, 'viewer');
    const [sent] = await members.listSentInvitations(id);
    await members.revokeInvitation(sent!.id);
    expect(await members.listSentInvitations(id)).toEqual([]);
    expect(await new SupabaseMembershipRepository(other.client).listReceivedInvitations()).toEqual([]);
  });

  it('reports a forbidden action as a readable error (FR-B26)', async () => {
    const owner = await newUser();
    const stranger = await newUser();
    const id = await newBusiness(owner.client);
    await expect(new SupabaseMembershipRepository(stranger.client).invite(id, 'x@y.co', 'staff')).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('records', () => {
  const sale = { occurredOn: '2026-10-05', productId: null, itemName: 'Egg tray', category: 'Egg sales', quantity: 1.5, unit: 'trays', unitPrice: 42, notes: 'Market day' };
  const expense = { occurredOn: '2026-10-06', category: 'Feed', description: 'Layer mash', amount: 980, quantity: 150, unit: 'kg', certainty: 'recorded' as const, notes: null };

  it('captures, reads, searches, edits and voids a sale (FR-C15 to FR-C22)', async () => {
    const { client } = await newUser();
    const id = await newBusiness(client);
    const sales = new SupabaseSalesRepository(client);

    await sales.create(id, sale);
    const [created] = await sales.list(id, {});
    expect(created).toMatchObject({ ...sale, totalAmount: 63, status: 'recorded', voidReason: null });

    expect(await sales.list(id, { search: 'market' })).toHaveLength(1);
    expect(await sales.list(id, { search: 'nothing' })).toHaveLength(0);
    expect(await sales.list(id, { categories: ['Egg sales'], from: '2026-10-01', to: '2026-10-31' })).toHaveLength(1);
    expect(await sales.list(id, { to: '2026-09-30' })).toHaveLength(0);

    await sales.update(created!.id, { ...sale, quantity: 2 });
    expect((await sales.get(created!.id)).totalAmount).toBe(84);

    await sales.void(created!.id, 'Entered twice');
    expect(await sales.get(created!.id)).toMatchObject({ status: 'voided', voidReason: 'Entered twice' });
  });

  it('search terms cannot inject filter conditions', async () => {
    const { client } = await newUser();
    const id = await newBusiness(client);
    const sales = new SupabaseSalesRepository(client);
    await sales.create(id, sale);
    await expect(sales.list(id, { search: 'x%,status.eq.voided),(item_name.ilike.%' })).resolves.toEqual([]);
  });

  it('captures, edits and voids an expense (FR-C23 to FR-C28)', async () => {
    const { client } = await newUser();
    const id = await newBusiness(client);
    const expenses = new SupabaseExpenseRepository(client);

    await expenses.create(id, expense);
    const [created] = await expenses.list(id, { search: 'mash' });
    expect(created).toMatchObject({ ...expense, status: 'recorded' });

    await expenses.update(created!.id, { ...expense, amount: 990, quantity: null, certainty: 'estimated' });
    expect(await expenses.get(created!.id)).toMatchObject({ amount: 990, quantity: null, certainty: 'estimated' });

    await expenses.void(created!.id, 'Duplicate');
    expect((await expenses.get(created!.id)).status).toBe('voided');
  });

  it('manages products, and protects those with sales (FR-C31 to FR-C37)', async () => {
    const { client } = await newUser();
    const id = await newBusiness(client);
    const products = new SupabaseProductRepository(client);
    const input = { kind: 'product' as const, name: 'Tray', category: 'Eggs', description: null, unit: 'tray', sellingPrice: 45 };

    await products.create(id, input);
    const [created] = await products.list(id, 'tra');
    expect(created).toMatchObject({ ...input, isActive: true });

    await products.update(created!.id, { ...input, sellingPrice: 50 });
    expect((await products.get(created!.id)).sellingPrice).toBe(50);

    await new SupabaseSalesRepository(client).create(id, { ...sale, productId: created!.id });
    await expect(products.remove(created!.id)).rejects.toMatchObject({ code: 'conflict' });

    await products.setActive(created!.id, false);
    expect((await products.get(created!.id)).isActive).toBe(false);

    await products.create(id, { ...input, name: 'Unused' });
    const unused = (await products.list(id, 'unused'))[0];
    await products.remove(unused!.id);
    expect(await products.list(id, 'unused')).toEqual([]);
  });

  it('reports a duplicate product name readably', async () => {
    const { client } = await newUser();
    const id = await newBusiness(client);
    const products = new SupabaseProductRepository(client);
    const input = { kind: 'product' as const, name: 'Tray', category: null, description: null, unit: 'tray', sellingPrice: 45 };
    await products.create(id, input);
    await expect(products.create(id, input)).rejects.toMatchObject({ code: 'conflict', message: 'This already exists.' });
  });

  it('merges industry categories with those a business adds (FR-C29)', async () => {
    const { client } = await newUser();
    const id = await newBusiness(client);
    const categories = new SupabaseCategoryRepository(client);
    // The business type's own categories come first, then the universal ones.
    expect((await categories.list(id, 'expense')).slice(0, 5)).toEqual(['Feed', 'Medication', 'Packaging', 'Transport', 'Other farm costs']);
    expect(await categories.list(id, 'expense')).toContain('Electricity');
    await categories.add(id, 'expense', 'Vet visits');
    expect(await categories.list(id, 'expense')).toContain('Vet visits');
    expect((await categories.list(id, 'sale'))[0]).toBe('Egg sales');

    const options = await categories.listOptions(id, 'expense');
    expect(options[0]).toEqual({ name: 'Feed', groupCode: 'stock_materials', groupName: 'Stock and materials' });
    expect(options.find((option) => option.name === 'Vet visits')).toEqual({ name: 'Vet visits', groupCode: null, groupName: null });
  });

  it('never returns another business\'s records', async () => {
    const owner = await newUser();
    const stranger = await newUser();
    const id = await newBusiness(owner.client);
    await new SupabaseSalesRepository(owner.client).create(id, sale);
    expect(await new SupabaseSalesRepository(stranger.client).list(id, {})).toEqual([]);
    await expect(new SupabaseSalesRepository(stranger.client).create(id, sale)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('operations and analytics', () => {
  it('records poultry activity and produces the expected KPIs end to end', async () => {
    const { client } = await newUser();
    const id = await newBusiness(client);
    const activities = new SupabaseActivityRepository(client);
    const flocks = new SupabaseFlockRepository(client);
    const analytics = new SupabaseAnalyticsRepository(client);

    // The pilot's essentials start switched on, and the rest wait for the owner.
    const types = await activities.listTypes(id);
    expect(types.filter((t) => t.isEnabled).map((t) => t.code)).toEqual(['eggs_collected', 'eggs_rejected', 'flock_count', 'feed_used', 'health_event', 'feed_received', 'mortality']);
    expect(types.find((t) => t.code === 'mortality')).toMatchObject({ groupName: 'Production and operations', quantityMode: 'required' });
    expect(types.find((t) => t.code === 'mortality')!.fields.map((f) => f.code)).toEqual(['cause']);
    const typeId = (code: string) => types.find((t) => t.code === code)!.id;

    await flocks.create(id, { name: 'House A', breed: 'Lohmann', acquiredOn: '2026-01-15', initialCount: 60 });
    const [flock] = await flocks.list(id);
    expect(flock).toMatchObject({ name: 'House A', initialCount: 60, isActive: true });

    const record = (code: string, quantity: number, unit: string) =>
      activities.create(id, { activityTypeId: typeId(code), occurredOn: '2026-10-05', quantity, unit, flockId: flock!.id, notes: null });
    await record('eggs_collected', 48, 'eggs');
    await record('eggs_rejected', 3, 'eggs');
    await record('flock_count', 60, 'hens');
    await record('feed_used', 7.2, 'kg');

    const [latest] = await activities.list(id, { activityTypeId: typeId('feed_used') });
    expect(latest).toMatchObject({ activityName: 'Feed consumed', quantity: 7.2, unit: 'kg', flockId: flock!.id });

    await new SupabaseSalesRepository(client).create(id, { occurredOn: '2026-10-05', productId: null, itemName: 'Eggs', category: 'Egg sales', quantity: 2, unit: 'trays', unitPrice: 42, notes: null });
    await new SupabaseExpenseRepository(client).create(id, { occurredOn: '2026-10-05', category: 'Feed', description: 'Feed', amount: 34, quantity: null, unit: null, certainty: 'recorded', notes: null });

    const kpis = Object.fromEntries((await analytics.computeKpis(id, RANGE)).map((kpi) => [kpi.code, kpi]));
    expect(kpis.revenue).toMatchObject({ value: 84, status: 'actual', unit: 'money', isHighlight: true });
    expect(kpis.expenses).toMatchObject({ value: 34, status: 'actual' });
    expect(kpis.recorded_balance).toMatchObject({ value: 50, status: 'estimated' });
    expect(kpis.hen_day_rate).toMatchObject({ value: 80, status: 'actual', unit: 'percent' });
    expect(kpis.usable_eggs).toMatchObject({ value: 45 });
    expect(kpis.feed_per_egg).toMatchObject({ value: 150, unit: 'grams' });
    expect(kpis.flock_size).toMatchObject({ value: 60 });
    expect(kpis.records_captured?.value).toBe(6);

    const completeness = await analytics.dataCompleteness(id, RANGE);
    expect(completeness.every((item) => item.isStarted)).toBe(true);

    const recent = await analytics.recentActivity(id, 3);
    expect(recent).toHaveLength(3);
    expect(recent[0]).toEqual(expect.objectContaining({ occurredOn: '2026-10-05' }));

    expect(await analytics.monthlySeries(id, 3)).toHaveLength(3);

    await activities.void(latest!.id, 'Mistake');
    expect((await activities.get(latest!.id)).status).toBe('voided');
    expect((await analytics.computeKpis(id, RANGE)).find((k) => k.code === 'feed_per_egg')?.status).toBe('unavailable');

    await flocks.setActive(flock!.id, false);
    expect((await flocks.get(flock!.id)).isActive).toBe(false);
  });

  it('computes retail expected stock end to end (FR-D28)', async () => {
    const { client } = await newUser();
    const id = await newBusiness(client, { industryCode: 'retail', name: 'Tsholofelo Tuckshop' });
    const activities = new SupabaseActivityRepository(client);
    const types = await activities.listTypes(id);
    const typeId = (code: string) => types.find((t) => t.code === code)!.id;
    const record = (code: string, occurredOn: string, quantity: number) =>
      activities.create(id, { activityTypeId: typeId(code), occurredOn, quantity, unit: 'items', flockId: null, notes: null });

    await record('stock_count', '2026-09-30', 500);
    await record('stock_received', '2026-10-02', 100);
    await record('stock_adjustment', '2026-10-03', -5);
    await new SupabaseSalesRepository(client).create(id, { occurredOn: '2026-10-04', productId: null, itemName: 'Bread', category: 'Product sales', quantity: 40, unit: 'items', unitPrice: 10, notes: null });

    const kpis = await new SupabaseAnalyticsRepository(client).computeKpis(id, RANGE);
    expect(kpis.find((k) => k.code === 'expected_stock')).toMatchObject({ value: 555, status: 'actual' });
  });

  it('rejects an activity from another industry with a readable message', async () => {
    const { client } = await newUser();
    const id = await newBusiness(client);
    const activities = new SupabaseActivityRepository(client);
    const shop = await newBusiness(client, { industryCode: 'retail', name: 'Other Shop' });
    const [retailType] = await activities.listTypes(shop);
    await expect(activities.create(id, { activityTypeId: retailType!.id, occurredOn: '2026-10-05', quantity: 1, unit: 'items', flockId: null, notes: null })).rejects.toMatchObject({
      code: 'validation',
      message: 'This activity is not available for this type of business.',
    });
  });

  it('refuses analytics for someone else\'s business', async () => {
    const owner = await newUser();
    const stranger = await newUser();
    const id = await newBusiness(owner.client);
    await expect(new SupabaseAnalyticsRepository(stranger.client).computeKpis(id, RANGE)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('learning', () => {
  it('runs the full lesson journey from request to completion', async () => {
    const owner = await newUser();
    const reviewer = await newUser();
    await grantRole(reviewer.email, 'learning_reviewer');
    const id = await newBusiness(owner.client);

    const lessons = new SupabaseLessonRepository(owner.client);
    const reviews = new SupabaseLessonReviewRepository(reviewer.client);

    expect(await new SupabaseLessonReviewRepository(owner.client).canReview()).toBe(false);
    expect(await reviews.canReview()).toBe(true);
    expect(await lessons.weeklyState(id)).toBeNull();

    await lessons.requestWeeklyLesson(id);
    const state = await lessons.weeklyState(id);
    expect(state?.status).toBe('pending_review');
    expect(await lessons.listMine(id)).toEqual([]);
    await expect(lessons.get(state!.lessonId)).rejects.toMatchObject({ code: 'not_found' });

    const queue = await reviews.list({ status: 'pending_review', search: 'useful' });
    const item = queue.find((lesson) => lesson.id === state!.lessonId);
    expect(item).toMatchObject({
      title: 'Start building a useful business record',
      generatedBy: 'template',
      businessId: id,
      businessContext: 'Vinabbie AgriSolutions · Poultry',
    });

    await reviews.edit(item!.id, { title: 'Edited', intro: 'Intro', example: 'Example', challenge: 'Challenge' });
    await reviews.decide(item!.id, 'approve', 'Good');
    expect((await reviews.get(item!.id)).status).toBe('published');

    const [published] = await lessons.listMine(id);
    expect(published).toMatchObject({ title: 'Edited', status: 'published' });
    expect(published?.publishedAt).toBeTruthy();

    await lessons.complete(published!.id, { answer: 'Done', rating: 5, feedback: null });
    expect((await lessons.get(published!.id)).status).toBe('completed');
  });

  it('stores learner preferences (FR-F02 to FR-F05)', async () => {
    const { client, userId } = await newUser();
    const profiles = new SupabaseLearnerProfileRepository(client);
    expect(await profiles.get(userId)).toBeNull();
    const profile = { goals: ['Costs'], topics: ['Profit', 'Stock'], preferredFormat: 'practical' as const };
    await profiles.save(userId, profile);
    expect(await profiles.get(userId)).toEqual({ ...profile, status: 'active' });
    await profiles.save(userId, { ...profile, goals: [] });
    expect((await profiles.get(userId))?.goals).toEqual([]);
  });

  it('blocks a learner from the review functions', async () => {
    const { client } = await newUser();
    const id = await newBusiness(client);
    const lessons = new SupabaseLessonRepository(client);
    await lessons.requestWeeklyLesson(id);
    const state = await lessons.weeklyState(id);
    await expect(new SupabaseLessonReviewRepository(client).decide(state!.lessonId, 'approve', null)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('assistant', () => {
  it('stores conversations and metadata, privately (FR-G02 to FR-G06, FR-G23)', async () => {
    const owner = await newUser();
    const stranger = await newUser();
    const id = await newBusiness(owner.client);
    const conversations = new SupabaseConversationRepository(owner.client);

    const conversationId = await conversations.start(id, 'About costs');
    await conversations.addMessage(conversationId, 'user', 'How are my costs?', null);
    await conversations.addMessage(conversationId, 'assistant', 'Here they are.', 'verified');
    await conversations.logRequest({ businessId: id, intent: 'kpi:expenses', outcome: 'answered', latencyMs: 12 });

    expect((await conversations.list(id))[0]).toMatchObject({ id: conversationId, title: 'About costs' });
    expect(await conversations.messages(conversationId)).toEqual([
      expect.objectContaining({ role: 'user', content: 'How are my costs?', confidence: null }),
      expect.objectContaining({ role: 'assistant', confidence: 'verified' }),
    ]);

    expect(await new SupabaseConversationRepository(stranger.client).messages(conversationId)).toEqual([]);

    await conversations.remove(conversationId);
    expect(await conversations.list(id)).toEqual([]);
  });
});

describe('notifications', () => {
  it('delivers, reads and removes notifications, and honours preferences (FR-H01 to FR-H08)', async () => {
    const { client } = await newUser();
    const notifications = new SupabaseNotificationRepository(client);

    const [welcome] = await notifications.list();
    expect(welcome).toMatchObject({ type: 'account', title: 'Welcome to Verida', isRead: false });

    await notifications.markRead(welcome!.id);
    expect((await notifications.list())[0]?.isRead).toBe(true);

    const defaults = { lessonPublished: true, learningReminders: true, businessUpdates: true, emailEnabled: true, taskReminders: true, quietStart: null, quietEnd: null };
    expect(await notifications.getPreferences()).toEqual(defaults);
    await notifications.savePreferences({ ...defaults, lessonPublished: false, emailEnabled: false, quietStart: '21:00', quietEnd: '06:00' });
    expect(await notifications.getPreferences()).toMatchObject({ lessonPublished: false, quietStart: '21:00', quietEnd: '06:00' });

    await notifications.remove(welcome!.id);
    expect(await notifications.list()).toEqual([]);
  });

  it('marks everything read at once', async () => {
    const owner = await newUser();
    const invited = await newUser();
    const id = await newBusiness(owner.client);
    await new SupabaseMembershipRepository(owner.client).invite(id, invited.email, 'staff');

    const notifications = new SupabaseNotificationRepository(invited.client);
    expect((await notifications.list()).filter((n) => !n.isRead).length).toBe(2);
    await notifications.markAllRead();
    expect((await notifications.list()).every((n) => n.isRead)).toBe(true);
  });
});

describe('plan', () => {
  it('creates goals and tasks, links them and reports progress (Plan module P0)', async () => {
    const { client } = await newUser('Planner');
    const id = await newBusiness(client, { name: 'Planning Farm' });
    const plan = new SupabasePlanRepository(client);
    const measurable = {
      description: null,
      unit: 'trays',
      tolerance: null,
      kpiCode: null,
      startOn: '2026-10-01',
      targetOn: '2026-12-31',
      status: 'active' as const,
      statusReason: null,
    };

    const goalId = await plan.createGoal(id, { ...measurable, title: 'Sell more trays', goalType: 'measurable', direction: 'increase', baselineValue: 300, targetValue: 450 });
    expect(await plan.goalProgress(goalId)).toMatchObject({ progressStatus: 'no_data', percent: null });
    await plan.addProgress(id, goalId, { recordedOn: '2026-10-15', actualValue: 360, note: null });
    expect(await plan.goalProgress(goalId)).toMatchObject({ actual: 360, percent: 40, source: 'manual' });

    const steps = await plan.createGoal(id, { ...measurable, title: 'Open a second house', goalType: 'milestone', direction: null, unit: null, baselineValue: null, targetValue: null, targetOn: null });
    await plan.addMilestone(id, steps, { title: 'Get quotes', dueOn: null, sortOrder: 1 });
    const [milestone] = await plan.listMilestones(steps);
    await plan.setMilestoneStatus(milestone!.id, 'completed');
    expect(await plan.goalProgress(steps)).toMatchObject({ milestonesDone: 1, milestonesTotal: 1, percent: null });

    const task = { title: 'Call two buyers', description: null, priority: 'high' as const, dueOn: '2026-10-20', blockerReason: null, assignedTo: null };
    const taskId = await plan.createTask(id, { ...task, status: 'not_started', completionNote: null, goalIds: [goalId, steps] });
    expect((await plan.getTask(taskId)).goalIds.sort()).toEqual([goalId, steps].sort());

    await plan.updateTask(id, taskId, { ...task, status: 'completed', completionNote: 'Both agreed to visit', goalIds: [goalId] });
    const [saved] = await plan.listTasks(id);
    expect(saved).toMatchObject({ status: 'completed', completionNote: 'Both agreed to visit', goalIds: [goalId], version: 2 });
    expect(saved!.completedAt).not.toBeNull();

    expect(await plan.overview(id, { from: '2026-10-01', to: '2026-10-31' })).toMatchObject({ openTasks: 0, activeGoals: 2, eligibleDue: 1 });
    expect((await plan.kpiOptions(id)).map((kpi) => kpi.code)).toContain('eggs_collected');
  });

  it('schedules repeating tasks and events, with reminders, comments, history and reviews (Plan module P1)', async () => {
    const { client, userId } = await newUser('Scheduler');
    const id = await newBusiness(client, { name: 'Schedule Farm' });
    const plan = new SupabasePlanRepository(client);
    const today = new Date().toISOString().slice(0, 10);
    const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

    const ruleId = await plan.createRule(id, {
      title: 'Collect eggs',
      description: null,
      priority: 'high',
      assignedTo: userId,
      frequency: 'daily',
      intervalCount: 1,
      daysOfWeek: [],
      dayOfMonth: null,
      startsOn: inDays(1),
      endsOn: null,
    });
    expect(await plan.getRule(ruleId)).toMatchObject({ frequency: 'daily', status: 'active', assignedTo: userId });
    const occurrences = await plan.listOccurrences(ruleId);
    expect(occurrences.length).toBeGreaterThanOrEqual(6);
    expect(occurrences.every((task) => task.ruleId === ruleId && task.occurrenceOn === task.dueOn)).toBe(true);
    expect(await plan.generateOccurrences(id)).toBe(0);

    const eventId = await plan.createEvent(id, { title: 'Vet visit', description: null, eventType: 'appointment', startsOn: inDays(2), startTime: '09:30', endTime: '10:00', status: 'scheduled' });
    expect(await plan.getEvent(eventId)).toMatchObject({ startTime: '09:30', endTime: '10:00' });
    const items = await plan.schedule(id, { from: today, to: inDays(30) });
    expect(items.filter((item) => item.kind === 'event')).toHaveLength(1);
    const days = items.filter((item) => item.ruleId === ruleId).map((item) => item.onDate);
    expect(new Set(days).size).toBe(days.length);
    expect(items.some((item) => item.kind === 'projected')).toBe(true);

    await plan.updateRule(ruleId, { title: 'Collect and grade eggs', description: null, priority: 'high', assignedTo: userId, endsOn: null });
    expect((await plan.listOccurrences(ruleId)).every((task) => task.title === 'Collect and grade eggs')).toBe(true);

    const [first] = occurrences;
    const task = await plan.getTask(first!.id);
    await plan.setReminder(task.id, inDays(1), '07:00');
    const [reminder] = await plan.listReminders(task.id);
    expect(reminder).toMatchObject({ status: 'pending' });
    await plan.snoozeReminder(reminder!.id, 60);
    await plan.dismissReminder(reminder!.id);
    expect((await plan.listReminders(task.id))[0]?.status).toBe('dismissed');

    await plan.addComment(id, task.id, 'Tray stock is low');
    const [comment] = await plan.listComments(task.id);
    expect(comment).toMatchObject({ body: 'Tray stock is low', authorId: userId, editedAt: null });
    await plan.editComment(comment!.id, 'Tray stock is very low');
    expect((await plan.listComments(task.id))[0]?.editedAt).not.toBeNull();
    await plan.removeComment(comment!.id);
    expect(await plan.listComments(task.id)).toEqual([]);

    const input = { title: task.title, description: null, priority: task.priority, status: 'completed' as const, dueOn: task.dueOn, completionNote: null, blockerReason: null, assignedTo: userId, goalIds: [] };
    await expect(plan.updateTask(id, task.id, input, task.version + 5)).rejects.toMatchObject({ code: 'conflict' });
    await plan.updateTask(id, task.id, input, task.version);
    expect(await plan.getTask(task.id)).toMatchObject({ status: 'completed', completedOn: today });
    const history = await plan.taskHistory(task.id);
    expect(history[0]?.changes.status).toEqual({ from: 'not_started', to: 'completed' });

    const period = { from: '2026-11-09', to: '2026-11-15' };
    expect(await plan.getReview(id, period.from)).toBeNull();
    await plan.saveReview(id, period, { summary: null, wins: 'Sold out', blockers: null, nextPriorities: 'Order feed' });
    await plan.saveReview(id, period, { summary: 'Good week', wins: 'Sold out', blockers: null, nextPriorities: 'Order feed' });
    expect(await plan.listReviews(id)).toEqual([expect.objectContaining({ periodStart: period.from, summary: 'Good week' })]);

    await plan.endRule(ruleId);
    expect((await plan.getRule(ruleId)).status).toBe('ended');
  });

  it('suggests, accepts and dismisses, links records, relates measures and syncs offline captures (Plan module P2 and the rest)', async () => {
    const { client } = await newUser('Completer');
    const id = await newBusiness(client, { name: 'Complete Farm' });
    const plan = new SupabasePlanRepository(client);
    const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    const task = { title: 'Pay the vet', description: null, priority: 'normal' as const, status: 'not_started' as const, dueOn: inDays(-3), completionNote: null, blockerReason: null, assignedTo: null, goalIds: [] };

    // Section 8: the same captured task sent twice is one task.
    const offline = { clientId: '5b0c4c4e-8f7a-4f42-9d55-7a2f3f1d9a10', recordedAt: new Date(Date.now() - 3_600_000).toISOString() };
    const first = await plan.createTask(id, task, offline);
    expect(await plan.createTask(id, task, offline)).toBe(first);
    expect((await plan.listTasks(id)).filter((t) => t.title === 'Pay the vet')).toHaveLength(1);

    // Section 4.6: the built-in rules suggest a new date for the overdue task; accepting moves it.
    const suggestionId = await plan.suggestFromRules(id, 'weekly_plan', null, null);
    expect(suggestionId).not.toBeNull();
    const suggestion = await plan.getSuggestion(suggestionId!);
    expect(suggestion).toMatchObject({ generator: 'rules', status: 'open', kind: 'weekly_plan' });
    const reschedule = suggestion.actions.find((a) => a.type === 'update_task');
    expect(reschedule?.payload).toMatchObject({ task_id: first, task_title: 'Pay the vet' });
    await plan.acceptAction(reschedule!.id, { due_on: inDays(2) });
    expect((await plan.getTask(first)).dueOn).toBe(inDays(2));
    expect((await plan.listSuggestions(id)).length).toBeLessThanOrEqual(1);

    const goalId = await plan.createGoal(id, { title: 'Open a shop', description: null, goalType: 'milestone', direction: null, unit: null, baselineValue: null, targetValue: null, tolerance: null, kpiCode: null, startOn: inDays(0), targetOn: null, status: 'active', statusReason: null });
    const steps = await plan.suggestFromRules(id, 'goal_breakdown', goalId, null);
    const stepSuggestion = await plan.getSuggestion(steps!);
    const taskAction = stepSuggestion.actions.find((a) => a.type === 'create_task')!;
    const made = await plan.acceptAction(taskAction.id, {});
    expect(await plan.taskOrigin(made)).toMatchObject({ suggestionId: steps, generator: 'rules' });
    expect((await plan.getTask(made)).goalIds).toEqual([goalId]);
    await plan.dismissSuggestion(steps!);
    expect((await plan.getSuggestion(steps!)).status).toBe('dismissed');

    // Settings, links and measures.
    expect(await plan.getSettings(id)).toEqual({ allowStaffAssignment: true, weeklySuggestions: false, defaultReminderTime: '08:00' });
    await plan.saveSettings(id, { allowStaffAssignment: false, weeklySuggestions: true, defaultReminderTime: '07:00' });
    expect(await plan.getSettings(id)).toEqual({ allowStaffAssignment: false, weeklySuggestions: true, defaultReminderTime: '07:00' });

    await plan.addTaskLink(id, made, { type: 'kpi', recordId: null, kpiCode: 'revenue', label: 'Revenue' });
    const [link] = await plan.listTaskLinks(made);
    expect(link).toMatchObject({ type: 'kpi', kpiCode: 'revenue', label: 'Revenue' });
    await plan.removeTaskLink(link!.id);
    expect(await plan.listTaskLinks(made)).toEqual([]);

    await plan.addGoalKpi(id, goalId, 'revenue');
    expect(await plan.listGoalKpis(goalId)).toEqual(['revenue']);
    expect((await plan.goalMeasures(goalId))[0]).toMatchObject({ code: 'revenue' });
    await plan.removeGoalKpi(goalId, 'revenue');
    expect(await plan.goalMeasures(goalId)).toEqual([]);

    // Section 4.4: a repeating event.
    const eventRule = await plan.createEventRule(id, { title: 'Market day', description: null, eventType: 'delivery', startTime: '08:00', endTime: '12:00', frequency: 'weekly', intervalCount: 1, daysOfWeek: [6], dayOfMonth: null, startsOn: inDays(0), endsOn: null });
    expect(await plan.getRule(eventRule)).toMatchObject({ kind: 'event', eventType: 'delivery', startTime: '08:00' });
    const events = await plan.listEventOccurrences(eventRule);
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]).toMatchObject({ ruleId: eventRule, startTime: '08:00', endTime: '12:00' });
  });

  it('makes offline goals, milestones and events once, and links a task from an insight to its measure (Plan gaps)', async () => {
    const { client } = await newUser('Gap closer');
    const id = await newBusiness(client, { name: 'Gap Farm' });
    const plan = new SupabasePlanRepository(client);
    const today = new Date().toISOString().slice(0, 10);

    const goal = { title: 'Open a shop', description: null, goalType: 'milestone' as const, direction: null, unit: null, baselineValue: null, targetValue: null, tolerance: null, kpiCode: null, startOn: today, targetOn: null, status: 'active' as const, statusReason: null };
    const offline = { clientId: '7d1c2a52-3c1e-4bd4-9f6f-2c4f1d8a7b03' };
    const goalId = await plan.createGoal(id, goal, offline);
    expect(await plan.createGoal(id, goal, offline)).toBe(goalId);
    expect((await plan.listGoals(id)).filter((g) => g.title === 'Open a shop')).toHaveLength(1);

    const milestone = { title: 'Get quotes', dueOn: null, sortOrder: 1, clientId: '8d1c2a52-3c1e-4bd4-9f6f-2c4f1d8a7b04' };
    await plan.addMilestone(id, goalId, milestone);
    await plan.addMilestone(id, goalId, milestone);
    expect(await plan.listMilestones(goalId)).toHaveLength(1);

    const event = { title: 'Market day', description: null, eventType: 'delivery' as const, startsOn: today, startTime: null, endTime: null, status: 'scheduled' as const };
    const eventOffline = { clientId: '9d1c2a52-3c1e-4bd4-9f6f-2c4f1d8a7b05' };
    const eventId = await plan.createEvent(id, event, eventOffline);
    expect(await plan.createEvent(id, event, eventOffline)).toBe(eventId);

    const suggestionId = await plan.suggestFromRules(id, 'insight_actions', null, null, { kpiCode: 'revenue', title: 'Revenue is down 20%', body: '', evidence: '' });
    const suggestion = await plan.getSuggestion(suggestionId!);
    expect(suggestion).toMatchObject({ insightKpi: 'revenue', insightTitle: 'Revenue is down 20%' });
    const taskId = await plan.acceptAction(suggestion.actions[0]!.id, {});
    expect(await plan.listTaskLinks(taskId)).toEqual([expect.objectContaining({ type: 'kpi', kpiCode: 'revenue', label: 'Revenue is down 20%' })]);
    expect((await plan.getTask(taskId)).attachmentPaths).toEqual([]);
  });
});
