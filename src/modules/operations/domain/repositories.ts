import type { ActivityInput, ActivityRecord, ActivityStatus, ActivityType, Flock, FlockInput } from './models';

export interface ActivityRepository {
  // Every type the business's types offer, switched on or off, with its form fields.
  listTypes(businessId: string): Promise<ActivityType[]>;
  setTypeEnabled(businessId: string, activityTypeId: string, enabled: boolean): Promise<void>;
  setStatus(id: string, status: Exclude<ActivityStatus, 'voided'>): Promise<void>;
  list(businessId: string, filter: { search?: string; activityTypeId?: string; from?: string }): Promise<ActivityRecord[]>;
  get(id: string): Promise<ActivityRecord>;
  create(businessId: string, input: ActivityInput): Promise<void>;
  // All rows are saved or none are.
  createMany(businessId: string, inputs: ActivityInput[]): Promise<void>;
  update(id: string, input: ActivityInput): Promise<void>;
  void(id: string, reason: string): Promise<void>;
}

export interface FlockRepository {
  list(businessId: string): Promise<Flock[]>;
  get(id: string): Promise<Flock>;
  create(businessId: string, input: FlockInput): Promise<void>;
  update(id: string, input: FlockInput): Promise<void>;
  setActive(id: string, isActive: boolean): Promise<void>;
}
