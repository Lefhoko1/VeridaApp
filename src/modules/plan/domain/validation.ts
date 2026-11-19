import { z } from 'zod';

import { dateField, numberField, optionalNumberField, optionalText, requiredText } from '@/core/forms/fields';

const optionalDate = z
  .string()
  .trim()
  .pipe(z.union([z.literal('').transform(() => null), dateField]));

const emptyToNull = (value: string) => (value === '' ? null : value);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const optionalTime = z
  .string()
  .trim()
  .refine((value) => value === '' || TIME.test(value), 'Enter a time as HH:MM, such as 08:30.')
  .transform((value) => (value === '' ? null : value));

// Section 4.4: how a task repeats. Kept as strings while the form is open.
export const ruleFields = {
  defaults: { repeat: 'none', intervalCount: '1', daysOfWeek: '', dayOfMonth: '', startsOn: '', endsOn: '' },
};

type RepeatValues = { repeat: string; intervalCount: string; daysOfWeek: number[]; dayOfMonth: string; startsOn: string | null; endsOn: string | null };

// Section 4.4: a repeating task or event needs a sensible pattern.
function checkRepeat(values: RepeatValues, context: z.RefinementCtx) {
  if (values.repeat === 'none') return;
  const every = Number(values.intervalCount);
  if (!Number.isInteger(every) || every < 1 || every > 52) {
    context.addIssue({ code: 'custom', path: ['intervalCount'], message: 'Enter a whole number from 1 to 52.' });
  }
  if (values.repeat === 'weekly' && values.daysOfWeek.length === 0) {
    context.addIssue({ code: 'custom', path: ['daysOfWeek'], message: 'Choose at least one day.' });
  }
  const day = Number(values.dayOfMonth);
  if (values.repeat === 'monthly' && (!Number.isInteger(day) || day < 1 || day > 31)) {
    context.addIssue({ code: 'custom', path: ['dayOfMonth'], message: 'Enter a day from 1 to 31.' });
  }
  if (!values.startsOn) {
    context.addIssue({ code: 'custom', path: ['startsOn'], message: 'Choose when it starts.' });
  } else if (values.endsOn && values.endsOn < values.startsOn) {
    context.addIssue({ code: 'custom', path: ['endsOn'], message: 'The end cannot be before the start.' });
  }
}

const repeatShape = {
  repeat: z.enum(['none', 'daily', 'weekly', 'monthly']),
  intervalCount: z.string().trim(),
  daysOfWeek: z.string().transform((value) => value.split(',').filter(Boolean).map(Number)),
  dayOfMonth: z.string().trim(),
  endsOn: optionalDate,
};

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
    ...repeatShape,
    startsOn: optionalDate,
  })
  .superRefine((task, context) => {
    if (task.status === 'blocked' && !task.blockerReason) {
      context.addIssue({ code: 'custom', path: ['blockerReason'], message: 'Say what is blocking the task.' });
    }
    checkRepeat(task, context);
  })
  .transform((task) => ({
    ...task,
    intervalCount: Number(task.intervalCount) || 1,
    dayOfMonth: task.repeat === 'monthly' ? Number(task.dayOfMonth) : null,
  }));

// Editing a series changes what each later occurrence looks like, and when it stops.
export const ruleUpdateSchema = z
  .object({
    title: requiredText('Task', 160),
    description: optionalText(2000),
    priority: z.enum(['low', 'normal', 'high', 'urgent']),
    assignedTo: z.string().transform(emptyToNull),
    endsOn: optionalDate,
    startsOn: z.string(),
  })
  .refine((rule) => !rule.endsOn || rule.endsOn >= rule.startsOn, { path: ['endsOn'], message: 'The end cannot be before the start.' });

// Entity PLAN_EVENT: a day, with optional local start and end times.
export const eventFormSchema = z
  .object({
    title: requiredText('Event', 160),
    description: optionalText(2000),
    eventType: z.enum(['meeting', 'delivery', 'appointment', 'deadline', 'other']),
    startsOn: dateField,
    startTime: optionalTime,
    endTime: optionalTime,
    status: z.enum(['scheduled', 'done', 'cancelled']),
    ...repeatShape,
  })
  .superRefine((event, context) => {
    checkRepeat({ ...event, startsOn: event.startsOn }, context);
    if (event.endTime && !event.startTime) {
      context.addIssue({ code: 'custom', path: ['startTime'], message: 'Add a start time, or leave both empty for all day.' });
    } else if (event.endTime && event.startTime && event.endTime <= event.startTime) {
      context.addIssue({ code: 'custom', path: ['endTime'], message: 'The end must be after the start.' });
    }
  })
  .transform((event) => ({ ...event, intervalCount: Number(event.intervalCount) || 1, dayOfMonth: event.repeat === 'monthly' ? Number(event.dayOfMonth) : null }));

export const reminderFormSchema = z.object({
  on: dateField,
  at: z
    .string()
    .trim()
    .refine((value) => TIME.test(value), 'Enter a time as HH:MM, such as 08:30.'),
});

export const commentFormSchema = z.object({ body: requiredText('Comment', 1000) });

export const reviewFormSchema = z.object({
  summary: optionalText(2000),
  wins: optionalText(2000),
  blockers: optionalText(2000),
  nextPriorities: optionalText(2000),
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
