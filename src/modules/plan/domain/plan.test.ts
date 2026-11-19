import { describeProgress, focusOrder, isOverdue, type GoalProgress, type Task } from './models';
import { goalFormSchema, ruleFields, taskFormSchema } from './validation';

const task = (overrides: Partial<Task>): Task => ({
  id: overrides.title ?? 't',
  title: 't',
  description: null,
  priority: 'normal',
  status: 'not_started',
  dueOn: null,
  completedAt: null,
  completionNote: null,
  blockerReason: null,
  assignedTo: null,
  version: 1,
  createdAt: '2026-10-01T00:00:00Z',
  goalIds: [],
  completedOn: null,
  ruleId: null,
  occurrenceOn: null,
  attachmentPaths: [],
  ...overrides,
});

describe('tasks (Plan section 4.3 and 7)', () => {
  const today = '2026-10-10';

  it('counts only open tasks before today as overdue', () => {
    expect(isOverdue(task({ dueOn: '2026-10-09' }), today)).toBe(true);
    expect(isOverdue(task({ dueOn: '2026-10-10' }), today)).toBe(false);
    expect(isOverdue(task({ dueOn: '2026-10-01', status: 'completed' }), today)).toBe(false);
    expect(isOverdue(task({ dueOn: null }), today)).toBe(false);
  });

  it('orders the focus list: overdue, due today, then by priority, leaving closed tasks out', () => {
    const ordered = focusOrder(
      [
        task({ title: 'later', dueOn: '2026-10-20' }),
        task({ title: 'urgent today', dueOn: today, priority: 'urgent' }),
        task({ title: 'overdue', dueOn: '2026-10-01', priority: 'low' }),
        task({ title: 'normal today', dueOn: today }),
        task({ title: 'no date' }),
        task({ title: 'done', dueOn: '2026-10-01', status: 'completed' }),
      ],
      today,
    );
    expect(ordered.map((t) => t.title)).toEqual(['overdue', 'urgent today', 'normal today', 'later', 'no date']);
  });

  it('asks only for a title, and a reason when blocked', () => {
    const base = { title: 'Order feed', description: '', priority: 'normal', status: 'not_started', dueOn: '', completionNote: '', blockerReason: '', assignedTo: '', goalIds: 'a,b', ...ruleFields.defaults };
    expect(taskFormSchema.parse(base)).toMatchObject({ dueOn: null, assignedTo: null, goalIds: ['a', 'b'] });
    expect(taskFormSchema.safeParse({ ...base, status: 'blocked' }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...base, title: ' ' }).success).toBe(false);
  });
});

describe('goals (Plan section 4.2 and 7)', () => {
  const goal = {
    title: 'Sell more',
    description: '',
    goalType: 'measurable',
    direction: 'increase',
    unit: 'trays',
    baselineValue: '300',
    targetValue: '450',
    tolerance: '5',
    kpiCode: '',
    startOn: '2026-10-01',
    targetOn: '2026-12-31',
    status: 'active',
    statusReason: '',
  };

  it('keeps only the parts that fit the goal', () => {
    expect(goalFormSchema.parse(goal)).toMatchObject({ direction: 'increase', baselineValue: 300, targetValue: 450, tolerance: null });
    expect(goalFormSchema.parse({ ...goal, goalType: 'milestone' })).toMatchObject({ direction: null, targetValue: null, unit: null, kpiCode: null });
  });

  it('refuses a measurable goal without a target, an equal baseline, a backwards date or an unexplained cancellation', () => {
    expect(goalFormSchema.safeParse({ ...goal, targetValue: '' }).success).toBe(false);
    expect(goalFormSchema.safeParse({ ...goal, baselineValue: '450' }).success).toBe(false);
    expect(goalFormSchema.safeParse({ ...goal, targetOn: '2026-09-01' }).success).toBe(false);
    expect(goalFormSchema.safeParse({ ...goal, status: 'cancelled' }).success).toBe(false);
  });

  const progress = (overrides: Partial<GoalProgress>): GoalProgress => ({
    actual: null,
    actualOn: null,
    source: null,
    percent: null,
    progressStatus: 'no_data',
    note: null,
    milestonesDone: 0,
    milestonesTotal: 0,
    ...overrides,
  });

  it('describes progress without inventing a percentage', () => {
    const measurable = { goalType: 'measurable' as const, unit: 'trays', targetValue: 450 };
    expect(describeProgress(measurable, progress({ actual: 360, percent: 40 }))).toBe('360 trays of 450 trays · 40%');
    expect(describeProgress(measurable, progress({ actual: 360, note: 'Add a starting value to see the percentage.' }))).toBe(
      '360 trays of 450 trays · Add a starting value to see the percentage.',
    );
    expect(describeProgress(measurable, progress({ note: 'Record progress.' }))).toBe('Record progress.');
    expect(describeProgress({ goalType: 'milestone', unit: null, targetValue: null }, progress({ note: '1 of 3 milestones completed.' }))).toBe('1 of 3 milestones completed.');
  });
});
