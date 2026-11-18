/**
 * @jest-environment node
 *
 * The new repositories through the real supabase-js client, against the real migrations.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { join } from 'node:path';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { SupabaseAuthRepository } from '@/modules/account/data/SupabaseAuthRepository';
import { SupabaseBusinessAdminRepository, SupabaseDeletionRepository, SupabaseRoleRepository, SupabaseUserAdminRepository } from '@/modules/administration/data/SupabaseAdminRepositories';
import { SupabaseIndustryConfigRepository } from '@/modules/administration/data/SupabaseIndustryConfigRepository';
import { SupabaseMonitoringRepository } from '@/modules/administration/data/SupabaseMonitoringRepository';
import { SupabaseConversationRepository } from '@/modules/assistant/data/SupabaseConversationRepository';
import { SupabaseBusinessRepository } from '@/modules/business/data/SupabaseBusinessRepository';
import { SupabaseMembershipRepository } from '@/modules/business/data/SupabaseMembershipRepository';
import type { BusinessDetails } from '@/modules/business/domain/models';
import { SupabaseLearnerProfileRepository, SupabaseLearningContentRepository, SupabaseLessonRepository, SupabaseLessonReviewRepository } from '@/modules/learning/data/SupabaseLearningRepositories';
import { SupabaseActivityRepository } from '@/modules/operations/data/SupabaseActivityRepository';
import { SupabaseExpenseRepository } from '@/modules/records/data/SupabaseExpenseRepository';
import { SupabaseSalesRepository } from '@/modules/records/data/SupabaseSalesRepository';

const CODE = '123456';
const PASSWORD = 'Verida2026';

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

let counter = 0;

async function newUser(name = 'Test User', role?: string) {
  const client: SupabaseClient = createClient(baseUrl, 'publishable-test-key', { auth: { persistSession: false, autoRefreshToken: false } });
  const auth = new SupabaseAuthRepository(client);
  const email = `admin-suite${(counter += 1)}-${Date.now()}@verida.test`;
  await auth.signUp({ fullName: name, email, password: PASSWORD });
  await auth.verifySignUp(email, CODE);
  if (role) await fetch(`${baseUrl}/__emulator/grant-role`, { method: 'POST', body: JSON.stringify({ email, role }) });
  const session = await auth.getSession();
  return { client, email, userId: session?.userId ?? '' };
}

const DETAILS: BusinessDetails = {
  name: 'Admin Suite Farm',
  industryCode: 'poultry',
  stage: 'Already operating',
  size: 'Small-scale',
  country: 'Botswana',
  location: 'Gaborone',
  currency: 'BWP',
  mainGoal: 'Grow',
  recordKeeping: 'Mostly manual records', additionalIndustries: [], otherType: null
};

const assertNoError = ({ error }: { error: { message: string } | null }) => {
  if (error) throw new Error(error.message);
};

describe('administration', () => {
  let admin: Awaited<ReturnType<typeof newUser>>;
  let member: Awaited<ReturnType<typeof newUser>>;
  let businessId: string;

  beforeAll(async () => {
    admin = await newUser('Admin Person', 'administrator');
    member = await newUser('Member Person');
    businessId = await new SupabaseBusinessRepository(member.client).register(DETAILS);
  }, 30_000);

  it('recognises platform roles', async () => {
    expect(await new SupabaseRoleRepository(admin.client).myRoles()).toEqual(['administrator']);
    expect(await new SupabaseRoleRepository(member.client).myRoles()).toEqual([]);
  });

  it('finds, reads, updates and suspends a user', async () => {
    const users = new SupabaseUserAdminRepository(admin.client);
    const found = await users.search({ query: 'member person', status: 'active' });
    expect(found.map((user) => user.id)).toContain(member.userId);

    const detail = await users.get(member.userId);
    expect(detail).toMatchObject({ fullName: 'Member Person', emailConfirmed: true, businessCount: 1, platformRoles: [] });

    await users.update(member.userId, { fullName: 'Renamed Member', phone: '+267 7000' });
    expect((await users.get(member.userId)).fullName).toBe('Renamed Member');

    await users.setStatus(member.userId, 'suspended');
    expect((await users.get(member.userId)).accountStatus).toBe('suspended');
    await users.setStatus(member.userId, 'active');
  });

  it('refuses a non-administrator, readably', async () => {
    await expect(new SupabaseUserAdminRepository(member.client).search({})).rejects.toMatchObject({ code: 'forbidden' });
    await expect(new SupabaseBusinessAdminRepository(member.client).search({})).rejects.toMatchObject({ code: 'forbidden' });
    await expect(new SupabaseMonitoringRepository(member.client).usageStats()).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('finds, configures and suspends a business', async () => {
    const businesses = new SupabaseBusinessAdminRepository(admin.client);
    expect((await businesses.search({ query: 'admin suite', industry: 'poultry', location: 'gaborone', status: 'active' })).map((b) => b.id)).toContain(businessId);

    const detail = await businesses.get(businessId);
    expect(detail).toMatchObject({ name: 'Admin Suite Farm', ownerEmail: member.email, memberCount: 1, currency: 'BWP' });

    await businesses.updateConfiguration(businessId, { industryCode: 'poultry', stage: 'Just starting', size: 'Medium-scale', currency: 'ZAR' });
    expect((await businesses.get(businessId)).currency).toBe('ZAR');

    await businesses.setStatus(businessId, 'suspended');
    expect(await new SupabaseBusinessRepository(member.client).listPermissions(businessId)).toEqual([]);
    await businesses.setStatus(businessId, 'active');
    await businesses.updateConfiguration(businessId, { industryCode: 'poultry', stage: 'Already operating', size: 'Small-scale', currency: 'BWP' });
  });

  it('configures an industry end to end, which then drives a new business', async () => {
    const industries = new SupabaseIndustryConfigRepository(admin.client);
    const code = `fishing_${Date.now()}`;
    const categoryCode = `marine_${Date.now()}`;
    await industries.createBusinessCategory({ code: categoryCode, name: `Marine ${Date.now()}`, description: 'The sea', icon: 'waves', sortOrder: 20, isActive: true });
    expect((await industries.getBusinessCategory(categoryCode)).icon).toBe('waves');
    await industries.createIndustry({ code, categoryCode, name: 'Fishing', shortName: 'Fish', description: 'Boats', icon: 'fish', chartTitle: 'Catch', sortOrder: 50, isActive: true });
    expect((await industries.getIndustry(code)).name).toBe('Fishing');

    await industries.addCategory(code, 'sale', 'Fresh fish');
    const [category] = await industries.listCategories(code);
    expect(category).toMatchObject({ kind: 'sale', name: 'Fresh fish' });

    await industries.addActivityType(code, { code: 'catch', name: 'Catch', description: 'Fish landed', defaultUnit: 'kg', usesFlock: false, allowsNegative: false, minQuantity: null, maxQuantity: 500, wholeNumbersOnly: false, notesRequired: false, allowedUnits: [] });
    const [activity] = await industries.listActivityTypes(code);
    expect(activity).toMatchObject({ code: 'catch', maxQuantity: 500 });
    await industries.updateActivityType(activity!.id, { code: 'catch', name: 'Catch landed', description: 'Fish landed', defaultUnit: 'kg', usesFlock: false, allowsNegative: false, minQuantity: null, maxQuantity: 400, wholeNumbersOnly: false, notesRequired: false, allowedUnits: [] });

    const kpiCode = `catch_${Date.now()}`;
    await industries.createKpiDefinition({ code: kpiCode, name: 'Catch', explanation: 'Fish landed.', formulaText: 'Sum', requiredData: 'Catch records', unitKind: 'quantity', formula: 'activity_total', activityCode: 'catch' });
    expect((await industries.listKpiDefinitions()).map((kpi) => kpi.code)).toContain(kpiCode);
    // Every new type starts with the shared financial measures.
    const shared = [
      { kpiCode: 'revenue', isHighlight: true },
      { kpiCode: 'expenses', isHighlight: true },
      { kpiCode: 'recorded_balance', isHighlight: false },
      { kpiCode: 'records_captured', isHighlight: false },
    ];
    expect(await industries.listIndustryKpis(code)).toEqual(shared);
    await industries.setIndustryKpi(code, kpiCode, true, true);
    expect(await industries.listIndustryKpis(code)).toContainEqual({ kpiCode, isHighlight: true });

    // A business in the new industry gets its activities, and the configured limit applies.
    const owner = await newUser();
    const boat = await new SupabaseBusinessRepository(owner.client).register({ ...DETAILS, name: 'Boat', industryCode: code });
    const activities = new SupabaseActivityRepository(owner.client);
    const [type] = await activities.listTypes([code]);
    await activities.create(boat, { activityTypeId: type!.id, occurredOn: '2026-10-05', quantity: 100, unit: 'kg', flockId: null, notes: null });
    await expect(activities.create(boat, { activityTypeId: type!.id, occurredOn: '2026-10-05', quantity: 401, unit: 'kg', flockId: null, notes: null })).rejects.toMatchObject({ code: 'validation', message: 'Catch landed cannot be more than 400.' });

    await expect(industries.removeActivityType(type!.id)).rejects.toMatchObject({ code: 'conflict' });
    await industries.setIndustryKpi(code, kpiCode, false, false);
    expect(await industries.listIndustryKpis(code)).toEqual(shared);
    await industries.removeCategory(category!.id);
    expect(await industries.listCategories(code)).toEqual([]);

    const ownerBusinesses = new SupabaseBusinessRepository(owner.client);
    expect((await ownerBusinesses.listIndustries()).find((i) => i.code === code)).toMatchObject({ categoryCode });
    expect((await ownerBusinesses.listCategories()).map((c) => c.code)).toContain(categoryCode);

    // Deactivating the category hides its types from setup.
    await industries.updateBusinessCategory(categoryCode, { name: `Marine ${Date.now()}`, description: 'The sea', icon: 'waves', sortOrder: 20, isActive: false });
    expect((await ownerBusinesses.listCategories()).map((c) => c.code)).not.toContain(categoryCode);
    expect((await ownerBusinesses.listIndustries()).map((i) => i.code)).not.toContain(code);
    await industries.updateBusinessCategory(categoryCode, { name: `Marine ${Date.now()}`, description: 'The sea', icon: 'waves', sortOrder: 20, isActive: true });

    await industries.updateIndustry(code, { categoryCode, name: 'Fishing', shortName: 'Fish', description: 'Boats', icon: 'fish', chartTitle: 'Catch', sortOrder: 50, isActive: false });
    expect((await ownerBusinesses.listIndustries()).map((i) => i.code)).not.toContain(code);
  });

  it('manages roles and the permission matrix', async () => {
    const roles = new SupabaseRoleRepository(admin.client);
    const someone = await newUser('Future Reviewer');
    await roles.grant(someone.email, 'learning_reviewer');
    expect((await roles.listAssignments()).some((a) => a.email === someone.email && a.role === 'learning_reviewer')).toBe(true);
    expect(await new SupabaseRoleRepository(someone.client).myRoles()).toEqual(['learning_reviewer']);
    await roles.revoke(someone.userId, 'learning_reviewer');
    expect(await new SupabaseRoleRepository(someone.client).myRoles()).toEqual([]);
    await expect(roles.grant('nobody@verida.test', 'administrator')).rejects.toMatchObject({ code: 'not_found' });

    const matrix = await roles.permissionMatrix();
    expect(matrix.roles.map((role) => role.code)).toContain('staff');
    expect(matrix.granted).toContainEqual({ role: 'staff', permission: 'records.create' });
    await roles.setRolePermission('viewer', 'records.create', true);
    expect((await roles.permissionMatrix()).granted).toContainEqual({ role: 'viewer', permission: 'records.create' });
    await roles.setRolePermission('viewer', 'records.create', false);
    await expect(roles.setRolePermission('owner', 'records.create', false)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('reports usage, health, errors, audit entries and AI metadata', async () => {
    const monitoring = new SupabaseMonitoringRepository(admin.client);
    await new SupabaseMonitoringRepository(member.client).reportError('app', 'Something broke');

    const stats = await monitoring.usageStats();
    expect(stats.find((stat) => stat.metric === 'users_total')?.value).toBeGreaterThan(0);
    expect((await monitoring.recentEvents()).some((event) => event.message === 'Something broke')).toBe(true);

    const services = await monitoring.checkServices();
    expect(services.find((s) => s.name === 'Database and API')?.status).toBe('up');
    expect(services.find((s) => s.name === 'Authentication')?.status).toBe('up');
    expect(services.find((s) => s.name === 'AI service')?.status).toBe('not_configured');

    expect((await monitoring.auditLog({ table: 'businesses' })).length).toBeGreaterThan(0);

    await new SupabaseConversationRepository(member.client).logRequest({ businessId, intent: 'kpi:revenue', outcome: 'answered', latencyMs: 40 });
    expect((await monitoring.aiRequests({ outcome: 'answered' }))[0]).toMatchObject({ intent: 'kpi:revenue', source: 'rules', businessName: 'Admin Suite Farm' });
    const today = new Date().toISOString().slice(0, 10);
    expect(await monitoring.aiUsage(today, today)).toMatchObject({ requests: 1, answered: 1, fromRules: 1 });
  });
});

describe('learning completion', () => {
  it('manages content, with versions and archiving', async () => {
    const admin = await newUser('Content Admin', 'administrator');
    const content = new SupabaseLearningContentRepository(admin.client);
    const input = { industryCode: 'poultry', topic: 'Feed', difficulty: 'beginner' as const, objective: 'Understand feed', kpiCode: 'feed_per_egg', title: 'Feed lesson', intro: 'I', example: 'E', challenge: 'C', activities: ['List your feed costs'], approvalStatus: 'draft' as const };
    await content.create(input);
    const [created] = await content.list({ search: 'feed lesson' });
    expect(created).toMatchObject({ ...input, version: 1 });

    await content.update(created!.id, { ...input, title: 'Feed lesson, improved', approvalStatus: 'approved' });
    expect(await content.get(created!.id)).toMatchObject({ version: 2, approvalStatus: 'approved' });

    await content.setStatus(created!.id, 'archived');
    expect((await content.list({ status: 'archived' })).map((c) => c.id)).toContain(created!.id);

    expect((await content.industryOptions()).map((o) => o.value)).toContain('poultry');
    expect((await content.kpiOptions()).map((o) => o.value)).toContain('feed_per_egg');
  });

  it('runs regeneration, source lookup, response correction and archiving', async () => {
    const reviewerUser = await newUser('Reviewer', 'learning_reviewer');
    const learner = await newUser('Learner');
    const businessId = await new SupabaseBusinessRepository(learner.client).register({ ...DETAILS, name: 'Lesson Farm' });
    await new SupabaseExpenseRepository(learner.client).create(businessId, { occurredOn: '2026-10-05', category: 'Feed', description: 'Feed', amount: 1, quantity: null, unit: null, certainty: 'recorded', notes: null });

    const lessons = new SupabaseLessonRepository(learner.client);
    const reviews = new SupabaseLessonReviewRepository(reviewerUser.client);
    // The AI function isn't available on the emulator, so this also proves the fallback path.
    await lessons.requestWeeklyLesson(businessId);
    const state = await lessons.weeklyState(businessId);
    expect(state?.status).toBe('pending_review');

    const before = await reviews.get(state!.lessonId);
    expect((await reviews.getSource(before.contentId)).title).toBe(before.title);

    await reviews.regenerate(before.id, 'Try other content');
    const after = await reviews.get(before.id);
    expect(after.title).not.toBe(before.title);
    expect(after.status).toBe('pending_review');

    await reviews.decide(before.id, 'approve', null);
    expect(await lessons.getResponse(before.id)).toBeNull();
    await lessons.complete(before.id, { answer: 'First', rating: 3, feedback: null });
    await lessons.correctResponse(before.id, { answer: 'Better', rating: 5, feedback: 'Useful' });
    expect(await lessons.getResponse(before.id)).toEqual({ answer: 'Better', rating: 5, feedback: 'Useful' });

    await reviews.archive(before.id);
    expect(await lessons.listMine(businessId)).toEqual([]);
  });

  it('keeps a learner profile status through its own function', async () => {
    const learner = await newUser('Profile Owner');
    const profiles = new SupabaseLearnerProfileRepository(learner.client);
    await profiles.save(learner.userId, { goals: ['Costs'], topics: [], preferredFormat: 'reading' });
    await profiles.setStatus('deactivated');
    expect(await profiles.get(learner.userId)).toMatchObject({ goals: ['Costs'], status: 'deactivated' });
    await profiles.save(learner.userId, { goals: ['Costs', 'Stock'], topics: [], preferredFormat: 'reading' });
    expect((await profiles.get(learner.userId))?.status).toBe('deactivated');
  });
});

describe('people and permissions', () => {
  let admin: Awaited<ReturnType<typeof newUser>>;
  let owner: Awaited<ReturnType<typeof newUser>>;
  let member: Awaited<ReturnType<typeof newUser>>;
  let businessId: string;

  beforeAll(async () => {
    admin = await newUser('Permissions Admin', 'administrator');
    owner = await newUser('Permissions Owner');
    member = await newUser('Permissions Member');
    businessId = await new SupabaseBusinessRepository(owner.client).register(DETAILS);
    await new SupabaseMembershipRepository(owner.client).invite(businessId, member.email, 'staff');
    const [invitation] = await new SupabaseMembershipRepository(member.client).listReceivedInvitations();
    await new SupabaseMembershipRepository(member.client).respondToInvitation(invitation!.id, true);
  }, 30_000);

  it('gives one member a permission, and takes it back (FR-B22)', async () => {
    const memberships = new SupabaseMembershipRepository(owner.client);
    const permission = async () => (await memberships.memberPermissions(businessId, member.userId)).find((item) => item.code === 'records.void');
    expect(await permission()).toEqual({ code: 'records.void', description: expect.any(String), fromRole: false, override: null, allowed: false });

    await memberships.setMemberPermission(businessId, member.userId, 'records.void', true);
    expect(await permission()).toMatchObject({ override: true, allowed: true });
    expect(await new SupabaseBusinessRepository(member.client).listPermissions(businessId)).toContain('records.void');

    await memberships.setMemberPermission(businessId, member.userId, 'records.void', null);
    expect(await permission()).toMatchObject({ override: null, allowed: false });
  });

  it('refuses to let an owner leave, readably, until ownership has moved (FR-A20)', async () => {
    const profile = owner.client.schema('identity');
    const refused = await profile.rpc('deactivate_account');
    expect(refused.error?.message).toContain('still owns Admin Suite Farm');

    await new SupabaseMembershipRepository(owner.client).transferOwnership(businessId, member.userId);
    const roles = await new SupabaseMembershipRepository(member.client).listMembers(businessId);
    expect(roles.find((item) => item.userId === member.userId)?.role).toBe('owner');
    expect(roles.find((item) => item.userId === owner.userId)?.role).toBe('manager');
  });

  it('lets Verida staff manage a team (FR-B22)', async () => {
    const businesses = new SupabaseBusinessAdminRepository(admin.client);
    const team = await businesses.listMembers(businessId);
    expect(team.map((item) => item.role).sort()).toEqual(['manager', 'owner']);

    await businesses.setMemberPermission(businessId, owner.userId, 'audit.view', true);
    expect((await businesses.memberPermissions(businessId, owner.userId)).find((item) => item.code === 'audit.view')).toMatchObject({ allowed: true });
    await businesses.changeMemberRole(businessId, owner.userId, 'viewer');
    await businesses.transferOwnership(businessId, owner.userId);
    await businesses.removeMember(businessId, member.userId);
    expect((await businesses.listMembers(businessId)).map((item) => item.role)).toEqual(['owner']);
    await expect(new SupabaseBusinessAdminRepository(member.client).listMembers(businessId)).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('manages what Verida staff can do (FR-I12)', async () => {
    const roles = new SupabaseRoleRepository(admin.client);
    expect(await roles.myPermissions()).toContain('deletions.process');
    expect(await new SupabaseRoleRepository(member.client).myPermissions()).toEqual([]);

    const staff = await newUser('Support Person');
    await roles.grant(staff.email, 'support');
    const mine = () => new SupabaseRoleRepository(staff.client).myPermissions();
    expect(await mine()).toContain('users.manage');
    expect(await mine()).not.toContain('audit.view');

    await roles.setStaffPermission(staff.userId, 'audit.view', true);
    expect(await mine()).toContain('audit.view');
    expect((await roles.staffPermissions(staff.userId)).find((item) => item.code === 'audit.view')).toMatchObject({ fromRole: false, override: true, allowed: true });
    await roles.setStaffPermission(staff.userId, 'audit.view', null);

    const matrix = await roles.staffRoleMatrix();
    expect(matrix.permissions.map((item) => item.code)).toContain('roles.manage');
    expect(matrix.granted).toContainEqual({ role: 'learning_reviewer', permission: 'lessons.review' });
    await roles.setStaffRolePermission('support', 'audit.view', true);
    expect(await mine()).toContain('audit.view');
    await roles.setStaffRolePermission('support', 'audit.view', false);
  });

  it('runs the deletion queue: retention, cancelling and erasing', async () => {
    const deletions = new SupabaseDeletionRepository(admin.client);
    expect(await deletions.retentionDays()).toBe(90);

    const leaver = await newUser('Leaving Person');
    assertNoError(await leaver.client.schema('identity').rpc('request_account_deletion'));
    const request = async () => (await deletions.queue()).find((item) => item.id === leaver.userId);
    expect(await request()).toMatchObject({ kind: 'account', name: 'Leaving Person', detail: leaver.email });
    await expect(deletions.erase((await request())!)).rejects.toMatchObject({ message: expect.stringContaining('retention period') });

    await deletions.setRetentionDays(0);
    await deletions.cancel((await request())!);
    expect(await request()).toBeUndefined();

    assertNoError(await leaver.client.schema('identity').rpc('request_account_deletion'));
    await deletions.erase((await request())!);
    const erased = await new SupabaseUserAdminRepository(admin.client).get(leaver.userId);
    expect(erased).toMatchObject({ fullName: 'Deleted user', accountStatus: 'erased' });
    await deletions.setRetentionDays(90);
  });

  it('can initiate and erase a business from the Verida side (FR-B13)', async () => {
    const deletions = new SupabaseDeletionRepository(admin.client);
    const closing = await newUser('Closing Owner');
    const closingId = await new SupabaseBusinessRepository(closing.client).register(DETAILS);
    await new SupabaseBusinessAdminRepository(admin.client).initiateDeletion(closingId);
    await deletions.setRetentionDays(0);
    const request = (await deletions.queue()).find((item) => item.id === closingId);
    expect(request?.kind).toBe('business');
    await deletions.erase(request!);
    await expect(new SupabaseBusinessAdminRepository(admin.client).get(closingId)).rejects.toBeDefined();
    await deletions.setRetentionDays(90);
  });
});

describe('lesson activities and assignment', () => {
  it('assigns content, and a learner answers each activity then deletes their response (FR-F35, section 5)', async () => {
    const admin = await newUser('Lesson Admin', 'administrator');
    const learner = await newUser('Lesson Learner');
    const businessId = await new SupabaseBusinessRepository(learner.client).register(DETAILS);
    const content = new SupabaseLearningContentRepository(admin.client);
    const title = `Costs ${Date.now()}`;
    await content.create({ industryCode: null, topic: 'Costs', difficulty: 'beginner', objective: 'Know costs', kpiCode: null, title, intro: 'I', example: 'E', challenge: 'C', activities: ['List your costs', 'Pick the biggest'], approvalStatus: 'approved' });
    const [item] = await content.list({ search: title });
    expect(item?.activities).toEqual(['List your costs', 'Pick the biggest']);

    const [workspace] = await content.learnerWorkspaces(learner.email);
    expect(workspace).toMatchObject({ businessId, fullName: 'Lesson Learner' });
    await content.assign(item!.id, workspace!.userId, workspace!.businessId);

    const reviews = new SupabaseLessonReviewRepository(admin.client);
    const [draft] = (await reviews.list({ status: 'pending_review', search: title }));
    expect((await reviews.listActivities(draft!.id)).map((activity) => activity.prompt)).toEqual(['List your costs', 'Pick the biggest']);
    await reviews.setActivities(draft!.id, ['List your costs', 'Rank them']);
    await reviews.decide(draft!.id, 'approve', null);

    const lessons = new SupabaseLessonRepository(learner.client);
    const [first, second] = await lessons.listActivities(draft!.id);
    expect(second?.prompt).toBe('Rank them');
    expect(first?.answer).toBeNull();
    await lessons.submitActivity(first!.id, 'Feed and rent');
    expect((await lessons.listActivities(draft!.id))[0]?.answer).toBe('Feed and rent');
    expect((await reviews.listActivities(draft!.id))[0]?.answer).toBe('Feed and rent');

    await lessons.complete(draft!.id, { answer: 'Done', rating: 5, feedback: null });
    expect(await reviews.getResponse(draft!.id)).toMatchObject({ answer: 'Done', rating: 5 });

    await lessons.deleteResponse(draft!.id);
    expect(await lessons.getResponse(draft!.id)).toBeNull();
    expect((await lessons.listActivities(draft!.id))[0]?.answer).toBeNull();
    expect((await lessons.get(draft!.id)).status).toBe('completed');
  });
});

describe('bulk record import', () => {
  it('saves all rows together, or none', async () => {
    const owner = await newUser('Importer');
    const businessId = await new SupabaseBusinessRepository(owner.client).register({ ...DETAILS, name: 'Import Farm' });
    const sales = new SupabaseSalesRepository(owner.client);
    const row = { occurredOn: '2026-10-05', productId: null, itemName: 'Eggs', category: 'Egg sales', quantity: 2, unit: 'trays', unitPrice: 42, notes: null };

    await sales.createMany(businessId, [row, { ...row, quantity: 3 }]);
    expect(await sales.list(businessId, {})).toHaveLength(2);

    await expect(sales.createMany(businessId, [row, { ...row, quantity: -1 }])).rejects.toBeTruthy();
    expect(await sales.list(businessId, {})).toHaveLength(2);
  });

  it('filters activity by date', async () => {
    const owner = await newUser('Date Filter');
    const businessId = await new SupabaseBusinessRepository(owner.client).register({ ...DETAILS, name: 'Filter Farm' });
    const activities = new SupabaseActivityRepository(owner.client);
    const [type] = await activities.listTypes(['poultry']);
    const row = { activityTypeId: type!.id, quantity: 1, unit: 'eggs', flockId: null, notes: null };
    await activities.createMany(businessId, [{ ...row, occurredOn: '2026-01-05' }, { ...row, occurredOn: '2026-10-05' }]);
    expect(await activities.list(businessId, { from: '2026-06-01' })).toHaveLength(1);
  });
});

describe('searching conversations', () => {
  it('matches by title', async () => {
    const owner = await newUser('Chatter');
    const businessId = await new SupabaseBusinessRepository(owner.client).register({ ...DETAILS, name: 'Chat Farm' });
    const conversations = new SupabaseConversationRepository(owner.client);
    await conversations.start(businessId, 'About feed costs');
    await conversations.start(businessId, 'Egg prices');
    expect((await conversations.list(businessId, 'feed')).map((c) => c.title)).toEqual(['About feed costs']);
  });
});
