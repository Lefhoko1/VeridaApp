import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { todayIso } from '@/core/format/format';
import { analyseImport } from '@/core/import/analyseImport';
import { useCsvImport } from '@/core/import/useCsvImport';
import { businessScope } from '@/core/query/queryClient';
import { useFeedback } from '@/design-system';
import { industriesOf, useActiveBusiness } from '@/modules/business';

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
      const parsed = activityFormSchema.safeParse({ activityTypeId: type.id, occurredOn: row.occurredOn, quantity: row.quantity, unit: row.unit || type.defaultUnit, flockId: '', notes: row.notes });
      if (!parsed.success) {
        context.addIssue({ code: 'custom', message: parsed.error.issues[0]?.message ?? 'This row is not valid.' });
        return z.NEVER;
      }
      const problem = activityRuleProblem(type, parsed.data);
      if (problem) {
        context.addIssue({ code: 'custom', message: problem });
        return z.NEVER;
      }
      return parsed.data;
    });
}

export function useActivityImportViewModel(onDone: () => void) {
  const { activities } = useOperationsDependencies();
  const { business, can } = useActiveBusiness();
  const feedback = useFeedback();
  const queryClient = useQueryClient();

  const types = useQuery({
    queryKey: ['platform', 'activity-types', ...industriesOf(business)],
    queryFn: () => activities.listTypes(industriesOf(business)),
    staleTime: Infinity,
  });
  const names = (types.data ?? []).map((type) => type.name);

  const flow = useCsvImport<ActivityInput>({
    analyse: (text) =>
      analyseImport(text, {
        columns: { date: 'occurredOn', activity: 'activity', quantity: 'quantity', unit: 'unit', notes: 'notes' },
        requiredColumns: ['date', 'activity', 'quantity'],
        defaults: { occurredOn: todayIso() },
        schema: importSchema(types.data ?? []),
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
