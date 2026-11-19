import type { Task } from './models';
import {
  addDays,
  addMonths,
  describeChanges,
  describeRule,
  groupByDay,
  isoWeekday,
  monthGrid,
  ordinal,
  reminderState,
  reviewFacts,
  scheduleRange,
  shiftAnchor,
  weekStart,
} from './schedule';
import { eventFormSchema, ruleFields, taskFormSchema } from './validation';

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

describe('schedule dates (Plan section 4.4)', () => {
  it('moves business days without any time zone shifting them', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-15', -3)).toBe('2025-12-15');
  });

  it('starts weeks on Monday', () => {
    expect(isoWeekday('2026-11-16')).toBe(1);
    expect(isoWeekday('2026-11-22')).toBe(7);
    expect(weekStart('2026-11-19')).toBe('2026-11-16');
    expect(weekStart('2026-11-22')).toBe('2026-11-16');
  });

  it('gives each view its period', () => {
    expect(scheduleRange('day', '2026-11-19')).toEqual({ from: '2026-11-19', to: '2026-11-19' });
    expect(scheduleRange('week', '2026-11-19')).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    expect(scheduleRange('list', '2026-11-19')).toEqual({ from: '2026-11-19', to: '2026-12-02' });
    // November 2026 starts on a Sunday, so the grid begins on Monday 26 October.
    expect(scheduleRange('month', '2026-11-19')).toEqual({ from: '2026-10-26', to: '2026-12-06' });
    expect(shiftAnchor('month', '2026-01-31', 1)).toBe('2026-02-28');
    expect(shiftAnchor('week', '2026-11-19', -1)).toBe('2026-11-12');
  });

  it('draws full weeks for a month', () => {
    const grid = monthGrid('2026-02-10');
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0]?.[0]).toBe('2026-01-26');
    expect(grid.flat()).toContain('2026-02-28');
  });

  it('groups items by day in order', () => {
    const groups = groupByDay([{ onDate: '2026-11-20' }, { onDate: '2026-11-19' }, { onDate: '2026-11-20' }]);
    expect(groups.map((g) => [g.day, g.items.length])).toEqual([
      ['2026-11-19', 1],
      ['2026-11-20', 2],
    ]);
  });
});

describe('repeating tasks', () => {
  it('describes a series in plain words', () => {
    expect(describeRule({ frequency: 'daily', intervalCount: 1, daysOfWeek: [], dayOfMonth: null })).toBe('Every day');
    expect(describeRule({ frequency: 'daily', intervalCount: 3, daysOfWeek: [], dayOfMonth: null })).toBe('Every 3 days');
    expect(describeRule({ frequency: 'weekly', intervalCount: 1, daysOfWeek: [4, 1], dayOfMonth: null })).toBe('Every week on Mon, Thu');
    expect(describeRule({ frequency: 'weekly', intervalCount: 2, daysOfWeek: [1, 2, 3, 4, 5], dayOfMonth: null })).toBe('Every 2 weeks on weekdays');
    expect(describeRule({ frequency: 'monthly', intervalCount: 1, daysOfWeek: [], dayOfMonth: 31 })).toBe('Every month on the 31st (or the last day)');
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd']);
  });

  it('asks for a weekday or a day of the month only when the pattern needs one', () => {
    const base = {
      ...ruleFields.defaults,
      title: 'Collect eggs',
      description: '',
      priority: 'normal',
      status: 'not_started',
      dueOn: '',
      completionNote: '',
      blockerReason: '',
      assignedTo: '',
      goalIds: '',
      dayOfMonth: '15',
      startsOn: '2026-11-19',
    };
    expect(taskFormSchema.safeParse({ ...base, repeat: 'weekly', daysOfWeek: '' }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...base, repeat: 'weekly', daysOfWeek: '1,4' }).success).toBe(true);
    expect(taskFormSchema.safeParse({ ...base, repeat: 'monthly', dayOfMonth: '32' }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...base, repeat: 'daily', endsOn: '2026-11-01' }).success).toBe(false);
    expect(taskFormSchema.safeParse({ ...base, repeat: 'none', daysOfWeek: '' }).success).toBe(true);
  });
});

describe('events', () => {
  const event = { title: 'Feed delivery', description: '', eventType: 'delivery', startsOn: '2026-11-20', startTime: '', endTime: '', status: 'scheduled', repeat: 'none', intervalCount: '1', daysOfWeek: '', dayOfMonth: '', endsOn: '' };

  it('accepts all-day events and checks times', () => {
    expect(eventFormSchema.safeParse(event).success).toBe(true);
    expect(eventFormSchema.safeParse({ ...event, startTime: '9:30' }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...event, startTime: '09:30', endTime: '09:00' }).success).toBe(false);
    expect(eventFormSchema.safeParse({ ...event, endTime: '10:00' }).success).toBe(false);
    expect(eventFormSchema.parse({ ...event, startTime: '09:30', endTime: '10:15' })).toMatchObject({ startTime: '09:30', endTime: '10:15' });
    expect(eventFormSchema.safeParse({ ...event, repeat: 'weekly' }).success).toBe(false);
    expect(eventFormSchema.parse({ ...event, repeat: 'weekly', daysOfWeek: '6' })).toMatchObject({ repeat: 'weekly', daysOfWeek: [6], intervalCount: 1 });
  });
});

describe('reminders (section 9)', () => {
  const now = new Date('2026-11-19T10:00:00Z');

  it('never claims delivery that has not happened', () => {
    expect(reminderState({ id: 'r', remindAt: '2026-11-19T11:00:00Z', status: 'pending', sentAt: null }, now).label).toBe('Pending');
    expect(reminderState({ id: 'r', remindAt: '2026-11-19T08:00:00Z', status: 'pending', sentAt: null }, now)).toEqual({ label: 'Waiting to be sent', tone: 'warn' });
    expect(reminderState({ id: 'r', remindAt: '2026-11-19T08:00:00Z', status: 'skipped', sentAt: null }, now).label).toMatch(/off/);
  });
});

describe('task history', () => {
  it('describes changes with names and labels', () => {
    const lines = describeChanges(
      {
        occurredAt: '2026-11-19T10:00:00Z',
        action: 'UPDATE',
        actorName: 'Neo',
        changes: { status: { from: 'not_started', to: 'blocked' }, assigned_to: { from: null, to: 'u1' }, due_on: { from: '2026-11-20', to: '2026-11-21' }, version: { from: 1, to: 2 } },
      },
      (id) => (id === 'u1' ? 'Kagiso' : null),
      (iso) => `day ${iso}`,
    );
    expect(lines).toEqual(['Status: Not started → Blocked', 'Assigned to: none → Kagiso', 'Due date: day 2026-11-20 → day 2026-11-21']);
    expect(describeChanges({ occurredAt: '', action: 'INSERT', actorName: null, changes: {} }, () => null, String)).toEqual(['Created the task']);
  });
});

describe('weekly review facts (section 4.5)', () => {
  it('sorts the week into completed, unfinished, blocked and coming up', () => {
    const tasks = [
      task({ title: 'done', status: 'completed', completedOn: '2026-11-18', dueOn: '2026-11-20' }),
      task({ title: 'done-before', status: 'completed', completedOn: '2026-11-10' }),
      task({ title: 'late', dueOn: '2026-11-17' }),
      task({ title: 'stuck', status: 'blocked', dueOn: '2026-11-30' }),
      task({ title: 'next', dueOn: '2026-11-25' }),
      task({ title: 'gone', status: 'cancelled', dueOn: '2026-11-17' }),
    ];
    const facts = reviewFacts(tasks, '2026-11-16', '2026-11-22');
    expect(facts.completed.map((t) => t.title)).toEqual(['done']);
    expect(facts.unfinished.map((t) => t.title)).toEqual(['late']);
    expect(facts.blocked.map((t) => t.title)).toEqual(['stuck']);
    expect(facts.upcoming.map((t) => t.title)).toEqual(['next']);
  });
});
