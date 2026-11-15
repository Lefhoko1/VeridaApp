import type {
  AssignableRole,
  BusinessDetails,
  BusinessStatus,
  ChangeEntry,
  Industry,
  Member,
  MemberPermission,
  Permission,
  ReceivedInvitation,
  SentInvitation,
  Workspace,
} from './models';

export interface BusinessRepository {
  listIndustries(): Promise<Industry[]>;
  listWorkspaces(): Promise<Workspace[]>;
  listPermissions(businessId: string): Promise<Permission[]>;
  register(details: BusinessDetails): Promise<string>;
  update(businessId: string, details: BusinessDetails): Promise<void>;
  setLogo(businessId: string, logoPath: string | null): Promise<void>;
  setStatus(businessId: string, status: Exclude<BusinessStatus, 'suspended'>): Promise<void>;
  changeHistory(businessId: string): Promise<ChangeEntry[]>;
}

export interface MembershipRepository {
  listMembers(businessId: string): Promise<Member[]>;
  listSentInvitations(businessId: string): Promise<SentInvitation[]>;
  listReceivedInvitations(): Promise<ReceivedInvitation[]>;
  invite(businessId: string, email: string, role: AssignableRole): Promise<void>;
  revokeInvitation(invitationId: string): Promise<void>;
  respondToInvitation(invitationId: string, accept: boolean): Promise<void>;
  changeRole(businessId: string, userId: string, role: AssignableRole): Promise<void>;
  removeMember(businessId: string, userId: string): Promise<void>;
  memberPermissions(businessId: string, userId: string): Promise<MemberPermission[]>;
  setMemberPermission(businessId: string, userId: string, permission: string, allowed: boolean | null): Promise<void>;
  transferOwnership(businessId: string, userId: string): Promise<void>;
}

// Selected workspace remembered between launches.
export interface ActiveBusinessStore {
  load(): Promise<string | null>;
  save(businessId: string): Promise<void>;
}
