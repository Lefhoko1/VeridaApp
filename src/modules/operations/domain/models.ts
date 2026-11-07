export type ActivityType = {
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

export type ActivityRecord = {
  id: string;
  activityTypeId: string;
  activityName: string;
  occurredOn: string;
  quantity: number;
  unit: string;
  flockId: string | null;
  notes: string | null;
  status: 'recorded' | 'voided';
  voidReason: string | null;
};

export type ActivityInput = {
  activityTypeId: string;
  occurredOn: string;
  quantity: number;
  unit: string;
  flockId: string | null;
  notes: string | null;
};

export type Flock = {
  id: string;
  name: string;
  breed: string | null;
  acquiredOn: string | null;
  initialCount: number | null;
  isActive: boolean;
};

export type FlockInput = {
  name: string;
  breed: string | null;
  acquiredOn: string | null;
  initialCount: number | null;
};
