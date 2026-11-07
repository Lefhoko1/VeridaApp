export type BusinessRole = 'owner' | 'manager' | 'staff' | 'viewer';
export type AssignableRole = Exclude<BusinessRole, 'owner'>;
export type BusinessStatus = 'active' | 'deactivated' | 'suspended' | 'deletion_requested';

export type Permission =
  | 'business.manage'
  | 'members.view'
  | 'members.manage'
  | 'records.view'
  | 'records.create'
  | 'records.edit'
  | 'records.void'
  | 'products.manage'
  | 'analytics.view'
  | 'audit.view';

export type Industry = {
  code: string;
  name: string;
  shortName: string;
  description: string;
  icon: string;
  chartTitle: string;
};

export type BusinessDetails = {
  name: string;
  industryCode: string;
  stage: string;
  size: string;
  country: string;
  location: string | null;
  currency: string;
  mainGoal: string | null;
  recordKeeping: string | null;
  // More types beyond industryCode, which stays the main one.
  additionalIndustries: string[];
  otherType: string | null;
};

// Every type a business has, the main one first.
export const industriesOf = (business: Pick<BusinessDetails, 'industryCode' | 'additionalIndustries'>): string[] => [business.industryCode, ...business.additionalIndustries];

export type Workspace = BusinessDetails & {
  id: string;
  status: BusinessStatus;
  myRole: BusinessRole;
};

export type Member = {
  userId: string;
  fullName: string;
  email: string;
  role: BusinessRole;
  joinedAt: string;
};

// FR-B22: what one member can do, and whether that comes from their role or was set for them.
export type MemberPermission = {
  code: string;
  description: string;
  fromRole: boolean;
  override: boolean | null;
  allowed: boolean;
};

export type SentInvitation = {
  id: string;
  email: string;
  role: AssignableRole;
  expiresAt: string;
};

export type ChangeEntry = {
  id: number;
  occurredAt: string;
  tableName: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  actorName: string | null;
  changedFields: string[];
};

export type ReceivedInvitation = {
  id: string;
  businessName: string;
  role: AssignableRole;
  expiresAt: string;
};
