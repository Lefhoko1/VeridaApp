import { z } from 'zod';

import { dateField, numberField, optionalNumberField, optionalText, requiredText } from '@/core/forms/fields';

const optionalDate = z
  .string()
  .trim()
  .pipe(z.union([z.literal('').transform(() => null), dateField]));

const emptyToNull = (value: string) => (value === '' ? null : value);

// Section 4.3 and journey 5.1: a title is enough, and the rest is asked for progressively.
export const taskFormSchema = z
  .object({
    title: requiredText('Task', 160),
    description: optionalText(2000),
    priority: z.enum(['low', 'normal', 'high', 'urgent']),
    status: z.enum(['not_started', 'in_progress', 'blocked', 'completed', 'cancelled']),
    dueOn: optionalDate,
    completionNote: optionalText(500),
    blockerReason: optionalText(500),
    assignedTo: z.string().transform(emptyToNull),
    // Several goals, held as one comma-separated value while the form is open.
    goalIds: z.string().transform((value) => value.split(',').filter(Boolean)),
  })
  .refine((task) => task.status !== 'blocked' || Boolean(task.blockerReason), {
    path: ['blockerReason'],
    message: 'Say what is blocking the task.',
  });

// Section 4.2: measurable goals need a direction and target; milestone goals use neither.
export const goalFormSchema = z
  .object({
    title: requiredText('Goal', 120),
    description: optionalText(1000),
    goalType: z.enum(['measurable', 'milestone']),
    direction: z.string(),
    unit: optionalText(30),
    baselineValue: optionalNumberField('Starting value'),
    targetValue: optionalNumberField('Target'),
    tolerance: optionalNumberField('Allowed difference', { min: 0 }),
    kpiCode: z.string().transform(emptyToNull),
    startOn: dateField,
    targetOn: optionalDate,
    status: z.enum(['active', 'on_hold', 'at_risk', 'completed', 'cancelled', 'expired']),
    statusReason: optionalText(300),
  })
  .superRefine((goal, context) => {
    if (goal.goalType === 'measurable') {
      if (!['increase', 'decrease', 'maintain', 'threshold'].includes(goal.direction)) {
        context.addIssue({ code: 'custom', path: ['direction'], message: 'Choose what the goal should do.' });
      }
      if (goal.targetValue === null) context.addIssue({ code: 'custom', path: ['targetValue'], message: 'Enter the target.' });
      if ((goal.direction === 'increase' || goal.direction === 'decrease') && goal.baselineValue !== null && goal.baselineValue === goal.targetValue) {
        context.addIssue({ code: 'custom', path: ['targetValue'], message: 'The target must differ from the starting value.' });
      }
    }
    if (goal.targetOn && goal.targetOn < goal.startOn) {
      context.addIssue({ code: 'custom', path: ['targetOn'], message: 'The target date cannot be before the start.' });
    }
    if (goal.status === 'cancelled' && !goal.statusReason) {
      context.addIssue({ code: 'custom', path: ['statusReason'], message: 'Say why the goal is cancelled.' });
    }
  })
  .transform((goal) => {
    const measurable = goal.goalType === 'measurable';
    const direction = measurable ? (goal.direction as 'increase' | 'decrease' | 'maintain' | 'threshold') : null;
    return {
      ...goal,
      direction,
      unit: measurable ? goal.unit : null,
      baselineValue: measurable ? goal.baselineValue : null,
      targetValue: measurable ? goal.targetValue : null,
      tolerance: direction === 'maintain' ? goal.tolerance : null,
      kpiCode: measurable ? goal.kpiCode : null,
    };
  });

export const progressFormSchema = z.object({
  recordedOn: dateField,
  actualValue: numberField('Value'),
  note: optionalText(300),
});

export const milestoneFormSchema = z.object({
  title: requiredText('Milestone', 120),
  dueOn: optionalDate,
});
