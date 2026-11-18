import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { todayIso } from '@/core/format/format';
import { analyseImport } from '@/core/import/analyseImport';
import { useCsvImport } from '@/core/import/useCsvImport';
import { businessScope } from '@/core/query/queryClient';
import { useFeedback } from '@/design-system';
import { useActiveBusiness } from '@/modules/business';

import type { ActivityInput, ActivityType } from '../../domain/models';
import { activityFormSchema, activityRuleProblem } from '../../domain/validation';
import { useOperationsDependencies } from '../di';

// Files name an activity in words, and it must be one this business's industry uses.
function importSchema(types: ActivityType[]) {
  return z
    .object({ activity: z.string(), occurredOn: z.string(), quantity: z.string(), unit: z.string(), notes: z.string() })
    .transform((row, context): ActivityInput => {
      const type = types.find((candidate) => candidate.name.toLowerCase() === row.activity.trim().toLowerCase());
      if (!type) {
        context.addIssue({ code: 'custom', message: `"${row.activity}" is not an activity for this business.` });
        return z.NEVER;
      }
      const parsed = activityFormSchema.safeParse({
        activityTypeId: type.id,
        occurredOn: row.occurredOn,
        status: 'recorded',
        quantity: row.quantity,
        unit: row.unit || type.defaultUnit,
        flockId: '',
        notes: row.notes,
        responsibleUserId: '',
        saleId: '',
        expenseId: '',
        productId: '',
      });
      if (!parsed.success) {
        context.addIssue({ code: 'custom', message: parsed.error.issues[0]?.message ?? 'This row is not valid.' });
        return z.NEVER;
      }
      const problem = activityRuleProblem(type, parsed.data);
      if (problem) {
        context.addIssue({ code: 'custom', message: problem });
        return z.NEVER;
      }
      // An import adds completed records with their quantity, and leaves form answers for later.
      const { activityTypeId, occurredOn, quantity, unit, flockId, notes } = parsed.data;
      return { activityTypeId, occurredOn, quantity, unit, flockId, notes, status: 'recorded' };
    });
}

export function useActivityImportViewModel(onDone: () => void) {
  const { activities } = useOperationsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();

  const types = useQuery({
    queryKey: [...businessScope(business.id), 'activity-types'],
    queryFn: () => activities.listTypes(business.id),
  });
  // Only activities that measure a quantity and are switched on fit the file's columns.
  const usable = (types.data ?? []).filter((type) => type.isEnabled && type.quantityMode !== 'none');
  const names = usable.map((type) => type.name);

  const flow = useCsvImport<ActivityInput>({
    analyse: (text) =>
      analyseImport(text, {
        columns: { date: 'occurredOn', activity: 'activity', quantity: 'quantity', unit: 'unit', notes: 'notes' },
        requiredColumns: ['date', 'activity', 'quantity'],
        defaults: { occurredOn: todayIso() },
        schema: importSchema(usable),
      }),
    commit: (rows) => activities.createMany(business.id, rows),
    onCommitted: (count) => {
      void queryClient.invalidateQueries({ queryKey: businessScope(business.id) });
      feedback.success(`${count} records imported.`);
      onDone();
    },
  });

  return {
    ...flow,
    columns: `date, activity (${names.join(', ') || 'loading'}), quantity, unit (optional), notes (optional)`,
    example: `date,activity,quantity\n2026-10-05,${names[0] ?? 'Activity'},48`,
    canImport: can('records.create'),
  };
}
