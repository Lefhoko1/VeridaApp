import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import type { Task } from '../../domain/models';
import type { PlanRepository } from '../../domain/repositories';
import type { RecurringRule } from '../../domain/schedule';
import { PlanDependenciesProvider } from '../di';
import { useTaskFormViewModel } from './usePlanViewModels';

const mockFeedback = { success: jest.fn(), error: jest.fn() };

jest.mock('@/design-system', () => ({ useFeedback: () => mockFeedback }));
jest.mock('@/modules/business', () => ({
  useActiveBusiness: () => ({ business: { id: 'biz-1' }, userId: 'me', can: () => true }),
  useMemberOptions: () => ({ options: [], nameOf: () => null }),
}));

const OCCURRENCE: Task = {
  id: 'task-1',
  title: 'Collect eggs',
  description: null,
  priority: 'normal',
  status: 'not_started',
  dueOn: '2026-11-20',
  completedAt: null,
  completionNote: null,
  blockerReason: null,
  assignedTo: null,
  version: 3,
  createdAt: '2026-11-19T00:00:00Z',
  goalIds: [],
  completedOn: null,
  ruleId: 'rule-1',
  occurrenceOn: '2026-11-20',
};

const RULE: RecurringRule = {
  id: 'rule-1',
  title: 'Collect eggs',
  description: null,
  priority: 'normal',
  assignedTo: null,
  frequency: 'daily',
  intervalCount: 1,
  daysOfWeek: [],
  dayOfMonth: null,
  startsOn: '2026-11-19',
  endsOn: null,
  status: 'active',
};

function fakePlan(overrides: Partial<PlanRepository> = {}): PlanRepository {
  const notUsed = jest.fn(async () => {
    throw new Error('not used');
  });
  return new Proxy(
    {
      listTasks: jest.fn(async () => []),
      listGoals: jest.fn(async () => []),
      getTask: jest.fn(async () => OCCURRENCE),
      getRule: jest.fn(async () => RULE),
      createTask: jest.fn(async () => 'new-task'),
      createRule: jest.fn(async () => 'new-rule'),
      updateTask: jest.fn(async () => undefined),
      updateRule: jest.fn(async () => undefined),
      ...overrides,
    } as Partial<PlanRepository>,
    { get: (target, key: string) => (target as Record<string, unknown>)[key] ?? notUsed },
  ) as PlanRepository;
}

function setup(plan: PlanRepository) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <PlanDependenciesProvider value={{ plan }}>{children}</PlanDependenciesProvider>
    </QueryClientProvider>
  );
  return { wrapper, onDone: jest.fn(), onSeriesCreated: jest.fn() };
}

beforeEach(() => jest.clearAllMocks());

describe('useTaskFormViewModel (Plan sections 4.3 and 4.4)', () => {
  it('saves a repeating task as a series, with the first guess of weekday taken from the start', async () => {
    const plan = fakePlan();
    const { wrapper, onDone, onSeriesCreated } = setup(plan);
    const { result } = await renderHook(() => useTaskFormViewModel({ onDone, onSeriesCreated }), { wrapper });

    await act(async () => {
      result.current.form.setValue('title', 'Collect eggs');
      result.current.form.setValue('startsOn', '2026-11-19');
    });
    await act(async () => result.current.setRepeat('weekly'));
    expect(result.current.chosenWeekdays).toEqual(['4']);
    expect(result.current.repeatSummary).toBe('Every week on Thu');
    await act(async () => result.current.submit());

    await waitFor(() => expect(onSeriesCreated).toHaveBeenCalledWith('new-rule'));
    expect(plan.createRule).toHaveBeenCalledWith('biz-1', expect.objectContaining({ title: 'Collect eggs', frequency: 'weekly', daysOfWeek: [4], startsOn: '2026-11-19', intervalCount: 1 }));
    expect(plan.createTask).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('saves a one-off task with the version it was opened at', async () => {
    const plan = fakePlan({ getTask: jest.fn(async () => ({ ...OCCURRENCE, ruleId: null, occurrenceOn: null })) });
    const { wrapper, onDone } = setup(plan);
    const { result } = await renderHook(() => useTaskFormViewModel({ taskId: 'task-1', onDone }), { wrapper });
    await waitFor(() => expect(result.current.form.values.title).toBe('Collect eggs'));
    expect(result.current.isOccurrence).toBe(false);

    await act(async () => result.current.form.setValue('priority', 'high'));
    await act(async () => result.current.submit());

    await waitFor(() => expect(onDone).toHaveBeenCalledWith('task-1'));
    expect(plan.updateTask).toHaveBeenCalledWith('biz-1', 'task-1', expect.objectContaining({ priority: 'high' }), 3);
  });

  it('changes this and later occurrences through the series when asked', async () => {
    const plan = fakePlan();
    const getTask = plan.getTask as jest.Mock;
    const { wrapper, onDone } = setup(plan);
    const { result } = await renderHook(() => useTaskFormViewModel({ taskId: 'task-1', onDone }), { wrapper });
    await waitFor(() => expect(result.current.seriesSummary).toBe('Every day'));

    await act(async () => {
      result.current.form.setValue('title', 'Collect and grade eggs');
      result.current.setEditScope('series');
    });
    // After the series changes, the occurrence has a new version.
    getTask.mockResolvedValueOnce(OCCURRENCE).mockResolvedValueOnce({ ...OCCURRENCE, title: 'Collect and grade eggs', version: 4 });
    await act(async () => result.current.submit());

    await waitFor(() => expect(onDone).toHaveBeenCalledWith('task-1'));
    expect(plan.updateRule).toHaveBeenCalledWith('rule-1', { title: 'Collect and grade eggs', description: null, priority: 'normal', assignedTo: null, endsOn: null });
    expect(plan.updateTask).toHaveBeenCalledWith('biz-1', 'task-1', expect.objectContaining({ title: 'Collect and grade eggs' }), 4);
    expect(mockFeedback.success).toHaveBeenCalledWith('This and later tasks updated.');
  });

  it('stops before changing the series if someone else changed the task meanwhile (section 8)', async () => {
    const plan = fakePlan();
    const { wrapper, onDone } = setup(plan);
    const { result } = await renderHook(() => useTaskFormViewModel({ taskId: 'task-1', onDone }), { wrapper });
    await waitFor(() => expect(result.current.seriesSummary).toBe('Every day'));

    await act(async () => result.current.setEditScope('series'));
    (plan.getTask as jest.Mock).mockResolvedValueOnce({ ...OCCURRENCE, version: 9 });
    await act(async () => result.current.submit());

    await waitFor(() => expect(mockFeedback.error).toHaveBeenCalledWith(expect.stringMatching(/Someone changed this task/)));
    expect(plan.updateRule).not.toHaveBeenCalled();
    expect(plan.updateTask).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });
});
