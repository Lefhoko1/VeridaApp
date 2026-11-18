// A question on an activity's form, configured by Verida staff (Activity Catalogue section 4).
export type ActivityFieldType = 'text' | 'integer' | 'decimal' | 'date' | 'time' | 'boolean' | 'select' | 'multi_select';

export type ActivityField = {
  code: string;
  label: string;
  help: string;
  dataType: ActivityFieldType;
  isRequired: boolean;
  unit: string | null;
  options: string[];
  minValue: number | null;
  maxValue: number | null;
};

export type QuantityMode = 'required' | 'optional' | 'none';

export type ActivityType = {
  id: string;
  code: string;
  name: string;
  description: string;
  groupCode: string;
  groupName: string;
  defaultUnit: string;
  quantityMode: QuantityMode;
  usesFlock: boolean;
  allowsNegative: boolean;
  minQuantity: number | null;
  maxQuantity: number | null;
  wholeNumbersOnly: boolean;
  notesRequired: boolean;
  allowedUnits: string[];
  // Whether this business uses it now, and whether new businesses start with it.
  isEnabled: boolean;
  enabledByDefault: boolean;
  fields: ActivityField[];
};

// 'recorded' is a completed activity, the only status that counts in measures.
export type ActivityStatus = 'planned' | 'in_progress' | 'recorded' | 'requires_review' | 'cancelled' | 'voided';

export const ACTIVITY_STATUS_LABELS: Record<ActivityStatus, string> = {
  planned: 'Planned',
  in_progress: 'In progress',
  recorded: 'Completed',
  requires_review: 'Needs review',
  cancelled: 'Cancelled',
  voided: 'Voided',
};

// An answer to one form field, as stored.
export type DetailValue = string | number | boolean | string[];

export type ActivityRecord = {
  id: string;
  activityTypeId: string;
  activityName: string;
  occurredOn: string;
  quantity: number | null;
  unit: string | null;
  flockId: string | null;
  notes: string | null;
  status: ActivityStatus;
  voidReason: string | null;
  // Where the receipts or other evidence are stored, if any were attached.
  receiptPaths: string[];
  details: Record<string, DetailValue>;
  formVersion: number | null;
  responsibleUserId: string | null;
  saleId: string | null;
  expenseId: string | null;
  productId: string | null;
};

export type ActivityInput = {
  activityTypeId: string;
  occurredOn: string;
  quantity: number | null;
  unit: string | null;
  flockId: string | null;
  notes: string | null;
  // Left out by imports, which never carry a receipt.
  receiptPaths?: string[];
  // Set when the record is created. Later changes go through setStatus.
  status?: Exclude<ActivityStatus, 'cancelled' | 'voided'>;
  details?: Record<string, DetailValue>;
  responsibleUserId?: string | null;
  saleId?: string | null;
  expenseId?: string | null;
  productId?: string | null;
};

// A sale, expense or product an activity can point to, without repeating its amount.
export type RelatedOption = { id: string; label: string };

// Where an activity's related records come from. The composition root connects it to the
// records module, so operations does not depend on it.
export type RelatedRecordsSource = {
  // People who can be responsible for an activity: the business's members.
  members(businessId: string): Promise<RelatedOption[]>;
  sales(businessId: string): Promise<RelatedOption[]>;
  expenses(businessId: string): Promise<RelatedOption[]>;
  products(businessId: string): Promise<RelatedOption[]>;
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
