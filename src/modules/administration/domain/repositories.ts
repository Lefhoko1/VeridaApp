import type {
  ActivityTypeConfig,
  ActivityTypeInput,
  AdminBusiness,
  AdminBusinessDetail,
  AdminMember,
  AdminUser,
  AdminUserDetail,
  AiRequest,
  AiUsage,
  AuditEntry,
  AuditFilter,
  BusinessConfiguration,
  BusinessFilter,
  DeletionRequest,
  ActivityFieldConfig,
  ActivityFieldInput,
  ActivityGroupConfig,
  ActivityTypeSummary,
  BusinessCategoryConfig,
  FinanceCategoryConfig,
  IndustryConfig,
  IndustryKpi,
  KpiDefinition,
  PermissionMatrix,
  PersonPermission,
  PlatformPermission,
  PlatformRole,
  RecordCategory,
  RoleAssignment,
  ServiceHealth,
  StaffRoleMatrix,
  SystemEvent,
  UsageStat,
  UserFilter,
} from './models';

export interface UserAdminRepository {
  search(filter: UserFilter): Promise<AdminUser[]>;
  get(id: string): Promise<AdminUserDetail>;
  update(id: string, input: { fullName: string; phone: string | null }): Promise<void>;
  setStatus(id: string, status: 'active' | 'suspended'): Promise<void>;
  initiateDeletion(id: string): Promise<void>;
}

export interface BusinessAdminRepository {
  search(filter: BusinessFilter): Promise<AdminBusiness[]>;
  get(id: string): Promise<AdminBusinessDetail>;
  updateConfiguration(id: string, configuration: BusinessConfiguration): Promise<void>;
  setStatus(id: string, status: 'active' | 'suspended'): Promise<void>;
  initiateDeletion(id: string): Promise<void>;
  listMembers(id: string): Promise<AdminMember[]>;
  changeMemberRole(id: string, userId: string, role: string): Promise<void>;
  removeMember(id: string, userId: string): Promise<void>;
  transferOwnership(id: string, userId: string): Promise<void>;
  memberPermissions(id: string, userId: string): Promise<PersonPermission[]>;
  setMemberPermission(id: string, userId: string, permission: string, allowed: boolean | null): Promise<void>;
}

export interface DeletionRepository {
  queue(): Promise<DeletionRequest[]>;
  retentionDays(): Promise<number>;
  setRetentionDays(days: number): Promise<void>;
  erase(request: DeletionRequest): Promise<void>;
  cancel(request: DeletionRequest): Promise<void>;
}

export interface IndustryConfigRepository {
  listActivityGroups(): Promise<ActivityGroupConfig[]>;
  getActivityGroup(code: string): Promise<ActivityGroupConfig>;
  createActivityGroup(input: ActivityGroupConfig): Promise<void>;
  updateActivityGroup(code: string, input: Omit<ActivityGroupConfig, 'code'>): Promise<void>;
  getActivityType(id: string): Promise<ActivityTypeSummary>;
  listActivityFields(activityTypeId: string): Promise<ActivityFieldConfig[]>;
  addActivityField(activityTypeId: string, input: ActivityFieldInput): Promise<void>;
  updateActivityField(id: string, input: ActivityFieldInput): Promise<void>;
  removeActivityField(id: string): Promise<void>;
  listFinanceCategories(): Promise<FinanceCategoryConfig[]>;
  getFinanceCategory(code: string): Promise<FinanceCategoryConfig>;
  createFinanceCategory(input: FinanceCategoryConfig): Promise<void>;
  updateFinanceCategory(code: string, input: Omit<FinanceCategoryConfig, 'code' | 'kind'>): Promise<void>;
  listBusinessCategories(): Promise<BusinessCategoryConfig[]>;
  getBusinessCategory(code: string): Promise<BusinessCategoryConfig>;
  createBusinessCategory(input: BusinessCategoryConfig): Promise<void>;
  updateBusinessCategory(code: string, input: Omit<BusinessCategoryConfig, 'code'>): Promise<void>;
  listIndustries(): Promise<IndustryConfig[]>;
  getIndustry(code: string): Promise<IndustryConfig>;
  createIndustry(input: IndustryConfig): Promise<void>;
  updateIndustry(code: string, input: Omit<IndustryConfig, 'code'>): Promise<void>;
  listCategories(code: string): Promise<RecordCategory[]>;
  addCategory(code: string, kind: 'sale' | 'expense', name: string, financeCategoryCode: string | null): Promise<void>;
  setCategoryGroup(id: string, financeCategoryCode: string | null): Promise<void>;
  removeCategory(id: string): Promise<void>;
  listActivityTypes(code: string): Promise<ActivityTypeConfig[]>;
  addActivityType(code: string, input: ActivityTypeInput): Promise<void>;
  updateActivityType(id: string, input: ActivityTypeInput): Promise<void>;
  removeActivityType(id: string): Promise<void>;
  listKpiDefinitions(): Promise<KpiDefinition[]>;
  createKpiDefinition(input: KpiDefinition): Promise<void>;
  listIndustryKpis(code: string): Promise<IndustryKpi[]>;
  setIndustryKpi(code: string, kpiCode: string, enabled: boolean, isHighlight: boolean): Promise<void>;
}

export interface RoleRepository {
  myRoles(): Promise<PlatformRole[]>;
  myPermissions(): Promise<PlatformPermission[]>;
  listAssignments(): Promise<RoleAssignment[]>;
  grant(email: string, role: PlatformRole): Promise<void>;
  revoke(userId: string, role: PlatformRole): Promise<void>;
  permissionMatrix(): Promise<PermissionMatrix>;
  setRolePermission(role: string, permission: string, allowed: boolean): Promise<void>;
  staffRoleMatrix(): Promise<StaffRoleMatrix>;
  setStaffRolePermission(role: string, permission: string, allowed: boolean): Promise<void>;
  staffPermissions(userId: string): Promise<PersonPermission[]>;
  setStaffPermission(userId: string, permission: string, allowed: boolean | null): Promise<void>;
}

export interface MonitoringRepository {
  usageStats(): Promise<UsageStat[]>;
  recentEvents(): Promise<SystemEvent[]>;
  checkServices(): Promise<ServiceHealth[]>;
  auditLog(filter: AuditFilter): Promise<AuditEntry[]>;
  aiUsage(from: string, to: string): Promise<AiUsage>;
  aiRequests(filter: { outcome?: string; from?: string; to?: string }): Promise<AiRequest[]>;
  reportError(source: string, message: string): Promise<void>;
}
