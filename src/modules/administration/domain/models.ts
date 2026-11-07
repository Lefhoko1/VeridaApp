export type PlatformRole = 'administrator' | 'learning_reviewer' | 'support';

export type PlatformPermission =
  | 'users.manage'
  | 'businesses.manage'
  | 'configuration.manage'
  | 'content.manage'
  | 'lessons.review'
  | 'monitoring.view'
  | 'audit.view'
  | 'ai_logs.view'
  | 'deletions.process'
  | 'roles.manage';

export type AccountStatus = 'pending_verification' | 'active' | 'suspended' | 'deactivated' | 'deletion_requested' | 'erased';

export type AdminUser = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  accountStatus: AccountStatus;
  createdAt: string;
};

export type AdminUserDetail = AdminUser & {
  emailConfirmed: boolean;
  lastSignInAt: string | null;
  platformRoles: string[];
  businessCount: number;
};

export type UserFilter = { query?: string; status?: string; from?: string; to?: string };

export type BusinessStatus = 'active' | 'deactivated' | 'suspended' | 'deletion_requested';

export type AdminBusiness = {
  id: string;
  name: string;
  industryCode: string;
  location: string | null;
  country: string;
  status: BusinessStatus;
  ownerEmail: string | null;
  memberCount: number;
  createdAt: string;
};

export type AdminBusinessDetail = AdminBusiness & {
  stage: string;
  size: string;
  currency: string;
  mainGoal: string | null;
};

export type BusinessFilter = { query?: string; industry?: string; location?: string; status?: string };

export type BusinessRoleCode = 'owner' | 'manager' | 'staff' | 'viewer';

export type AdminMember = { userId: string; fullName: string; email: string; role: BusinessRoleCode };

// What one person can do, and whether that comes from their role or was set for them.
export type PersonPermission = { code: string; description: string; fromRole: boolean; override: boolean | null; allowed: boolean };

export type DeletionKind = 'account' | 'business' | 'learner_profile';

export type DeletionRequest = { kind: DeletionKind; id: string; name: string; detail: string | null; requestedAt: string; erasableFrom: string };

export type BusinessConfiguration = { industryCode: string; stage: string; size: string; currency: string };

export type IndustryConfig = {
  code: string;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  chartTitle: string;
  sortOrder: number;
  isActive: boolean;
};

export type RecordCategory = { id: string; kind: 'sale' | 'expense'; name: string };

export type ActivityTypeConfig = {
  id: string;
  code: string;
  name: string;
  description: string;
  defaultUnit: string;
  usesFlock: boolean;
  allowsNegative: boolean;
  minQuantity: number | null;
  maxQuantity: number | null;
  wholeNumbersOnly: boolean;
  notesRequired: boolean;
  allowedUnits: string[];
};

export type ActivityTypeInput = Omit<ActivityTypeConfig, 'id'>;

export type KpiUnit = 'money' | 'count' | 'percent' | 'grams' | 'quantity';

export type KpiDefinition = {
  code: string;
  name: string;
  explanation: string;
  formulaText: string;
  requiredData: string;
  unitKind: KpiUnit;
  formula: string;
  activityCode: string | null;
};

export type IndustryKpi = { kpiCode: string; isHighlight: boolean };

export type RoleAssignment = { userId: string; fullName: string; email: string; role: PlatformRole; grantedAt: string };

export type StaffRoleMatrix = {
  permissions: { code: string; description: string }[];
  granted: { role: string; permission: string }[];
};

export type PermissionMatrix = {
  roles: { code: string; name: string }[];
  permissions: { code: string; description: string }[];
  granted: { role: string; permission: string }[];
};

export type UsageStat = { metric: string; label: string; value: number };

export type SystemEvent = { id: number; source: string; severity: 'info' | 'warning' | 'error'; message: string; createdAt: string };

export type ServiceHealth = { name: string; status: 'up' | 'down' | 'not_configured'; latencyMs: number | null; detail: string | null };

export type AuditEntry = {
  id: number;
  occurredAt: string;
  tableSchema: string;
  tableName: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actorEmail: string | null;
  changedFields: string[];
};

export type AuditFilter = { table?: string; action?: string; from?: string; to?: string };

export type AiRequest = {
  id: number;
  createdAt: string;
  intent: string;
  outcome: 'answered' | 'insufficient_data' | 'failed';
  source: 'ai' | 'rules';
  latencyMs: number | null;
  userEmail: string | null;
  businessName: string | null;
};

export type AiUsage = {
  requests: number;
  answered: number;
  insufficientData: number;
  failed: number;
  fromAi: number;
  fromRules: number;
  averageLatencyMs: number | null;
};
