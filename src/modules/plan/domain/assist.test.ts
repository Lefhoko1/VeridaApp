import { describeAction, describeOutboxItem, mergeOntoLatest } from './assist';
import type { TaskInput } from './models';

const day = (iso: string) => `[${iso}]`;
const goalTitle = (id: string) => (id === 'g1' ? 'Sell 450 trays' : null);

describe('suggested actions (Plan section 4.6)', () => {
  it('says exactly what accepting each kind of action does', () => {
    expect(describeAction({ type: 'create_task', payload: { title: 'Call buyers', due_on: '2026-11-21', priority: 'high', goal_ids: ['g1'] }, finalPayload: null }, goalTitle, day)).toEqual({
      verb: 'Add task',
      heading: 'Call buyers',
      detail: 'by [2026-11-21] · high priority · for Sell 450 trays',
    });
    expect(describeAction({ type: 'update_task', payload: { task_title: 'Fix fence', due_on: '2026-11-24', priority: 'urgent' }, finalPayload: null }, goalTitle, day)).toEqual({
      verb: 'Change task',
      heading: 'Fix fence',
      detail: 'move to [2026-11-24] and make it urgent priority',
    });
    expect(describeAction({ type: 'create_event', payload: { title: 'Market', starts_on: '2026-11-22', start_time: '08:00', end_time: '12:00' }, finalPayload: null }, goalTitle, day).detail).toBe('[2026-11-22] · 08:00–12:00');
    expect(describeAction({ type: 'create_goal', payload: { title: 'Open a shop' }, finalPayload: null }, goalTitle, day).detail).toBe('tracked by steps');
  });

  it('shows what was actually accepted once a person edited it', () => {
    expect(describeAction({ type: 'create_task', payload: { title: 'Order feed' }, finalPayload: { title: 'Order 20 bags of feed' } }, goalTitle, day).heading).toBe('Order 20 bags of feed');
  });
});

describe('offline changes (Plan section 8)', () => {
  const base: TaskInput = { title: 'Fix fence', description: null, priority: 'normal', status: 'not_started', dueOn: '2026-11-20', completionNote: null, blockerReason: null, assignedTo: null, goalIds: [] };

  it('keeps a completion made offline without undoing someone else’s other edits', () => {
    const mine = { ...base, status: 'completed' as const };
    const theirs = { ...base, title: 'Fix the north fence', priority: 'high' as const };
    expect(mergeOntoLatest(base, mine, theirs)).toEqual({ ...theirs, status: 'completed' });
  });

  it('describes what is waiting, and asks for a choice on a conflict', () => {
    expect(describeOutboxItem({ kind: 'create', clientId: 'c', recordedAt: '', input: base, error: null })).toEqual({ title: 'Fix fence', detail: 'New task, waiting to sync' });
    const update = { kind: 'update' as const, clientId: 'u', recordedAt: '', taskId: 't', taskTitle: 'Fix fence', expectedVersion: 2, base, input: { ...base, status: 'completed' as const }, conflict: false, error: null };
    expect(describeOutboxItem(update).detail).toBe('Marked completed, waiting to sync');
    expect(describeOutboxItem({ ...update, conflict: true }).detail).toMatch(/Choose which version/);
  });
});
