import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

import { AppError } from "@/core/errors/AppError";

import type { OutboxItem, PlanOutbox, Suggestion } from "../../domain/assist";
import type { Task, TaskInput } from "../../domain/models";
import type { PlanRepository } from "../../domain/repositories";
import { PlanDependenciesProvider } from "../di";
import { useSuggestionViewModel } from "./useAssistViewModels";
import { usePlanSync } from "./usePlanSync";

const mockFeedback = { success: jest.fn(), error: jest.fn() };
jest.mock("@/design-system", () => ({ useFeedback: () => mockFeedback }));
jest.mock("@/core/app/useOnForeground", () => ({
  useOnForeground: () => undefined,
}));
jest.mock("@/modules/business", () => ({
  useActiveBusiness: () => ({
    business: { id: "biz-1" },
    userId: "me",
    can: () => true,
  }),
  useMemberOptions: () => ({
    options: [],
    ownerOptions: [],
    nameOf: () => null,
  }),
}));

const INPUT: TaskInput = {
  title: "Fix fence",
  description: null,
  priority: "normal",
  status: "not_started",
  dueOn: null,
  completionNote: null,
  blockerReason: null,
  assignedTo: null,
  goalIds: [],
};
const TASK: Task = {
  ...INPUT,
  id: "task-1",
  completedAt: null,
  version: 2,
  createdAt: "2026-11-19T00:00:00Z",
  completedOn: null,
  ruleId: null,
  occurrenceOn: null,
};
const offline = () => new AppError("network", "We could not reach Verida.");

function memoryOutbox(): PlanOutbox & { items: () => OutboxItem[] } {
  let items: OutboxItem[] = [];
  return {
    items: () => items,
    list: async () => items,
    put: async (_scope, item) => {
      items = [
        ...items.filter((existing) => existing.clientId !== item.clientId),
        item,
      ];
    },
    remove: async (_scope, clientId) => {
      items = items.filter((existing) => existing.clientId !== clientId);
    },
  };
}

function fakePlan(overrides: Partial<PlanRepository>): PlanRepository {
  return new Proxy(
    {
      listTasks: async () => [],
      listGoals: async () => [],
      getSettings: async () => ({
        allowStaffAssignment: true,
        weeklySuggestions: false,
        defaultReminderTime: "08:00",
      }),
      ...overrides,
    } as Partial<PlanRepository>,
    {
      get: (target, key: string) =>
        (target as Record<string, unknown>)[key] ??
        jest.fn(async () => undefined),
    },
  ) as PlanRepository;
}

function wrapperFor(
  plan: PlanRepository,
  outbox: PlanOutbox,
  advisor = { suggest: jest.fn() },
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <PlanDependenciesProvider
          value={{
            plan,
            outbox,
            advisor,
            links: {
              sales: async () => [],
              expenses: async () => [],
              products: async () => [],
              activities: async () => [],
            },
          }}
        >
          {children}
        </PlanDependenciesProvider>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => jest.clearAllMocks());

describe("usePlanSync (Plan section 8)", () => {
  it("keeps a task captured offline and sends it once, with its client id, when the connection returns", async () => {
    const outbox = memoryOutbox();
    const createTask = jest
      .fn()
      .mockRejectedValueOnce(offline())
      .mockResolvedValue("task-9");
    const { result } = await renderHook(() => usePlanSync(), {
      wrapper: wrapperFor(fakePlan({ createTask }), outbox),
    });

    await act(async () => result.current.enqueueCreate(INPUT));
    await waitFor(() => expect(result.current.pending).toHaveLength(1));
    expect(result.current.offline).toBe(true);

    await act(async () => result.current.syncNow());
    await waitFor(() => expect(createTask).toHaveBeenCalledTimes(1));
    expect(outbox.items()).toHaveLength(1);

    await act(async () => result.current.syncNow());
    await waitFor(() => expect(outbox.items()).toHaveLength(0));
    // Both attempts carry the same client id, so the database makes one task however often it is sent.
    const [first, second] = createTask.mock.calls.map(
      (call) =>
        (
          call as [string, TaskInput, { clientId: string; recordedAt: string }]
        )[2],
    );
    expect(second?.clientId).toBe(first?.clientId);
    expect(second?.recordedAt).toBe(first?.recordedAt);
    expect(result.current.offline).toBe(false);
  });

  it("never applies a change over someone else’s newer one, and lets the person keep theirs without losing the other edits", async () => {
    const outbox = memoryOutbox();
    const latest: Task = { ...TASK, title: "Fix the north fence", version: 5 };
    const updateTask = jest
      .fn()
      .mockRejectedValueOnce(
        new AppError("conflict", "Someone changed this task."),
      )
      .mockResolvedValue(undefined);
    const { result } = await renderHook(() => usePlanSync(), {
      wrapper: wrapperFor(
        fakePlan({ updateTask, getTask: async () => latest }),
        outbox,
      ),
    });

    await act(async () =>
      result.current.enqueueUpdate(TASK, { ...INPUT, status: "completed" }),
    );
    await act(async () => result.current.syncNow());
    await waitFor(() => expect(result.current.pending[0]?.conflict).toBe(true));

    await act(async () =>
      result.current.keepMine(result.current.pending[0]?.clientId ?? ""),
    );
    await waitFor(() => expect(outbox.items()).toHaveLength(0));
    expect(updateTask).toHaveBeenLastCalledWith(
      "biz-1",
      "task-1",
      expect.objectContaining({
        title: "Fix the north fence",
        status: "completed",
      }),
      5,
    );
  });
});

describe("useSuggestionViewModel (Plan section 4.6)", () => {
  const SUGGESTION: Suggestion = {
    id: "s1",
    kind: "weekly_plan",
    goalId: null,
    request: "Free mornings",
    title: "This week",
    explanation: "Focus on buyers.",
    assumptions: null,
    limitations: "Sales cover 30 days.",
    sources: [],
    periodStart: "2026-11-20",
    periodEnd: "2026-11-26",
    generator: "ai",
    model: "claude-opus-5-5",
    status: "open",
    generatedAt: "2026-11-20T06:00:00Z",
    actions: [
      {
        id: "a1",
        type: "create_task",
        payload: { title: "Call buyers", due_on: "2026-11-21" },
        finalPayload: null,
        why: "Overdue",
        status: "proposed",
        createdTaskId: null,
        createdGoalId: null,
        createdEventId: null,
        createdMilestoneId: null,
        decidedAt: null,
      },
    ],
  };

  it("labels the suggestion with its model and date, and sends only the fields a person changed", async () => {
    const acceptAction = jest.fn(async () => "task-1");
    const { result } = await renderHook(
      () => useSuggestionViewModel("s1", { onReplaced: jest.fn() }),
      {
        wrapper: wrapperFor(
          fakePlan({ getSuggestion: async () => SUGGESTION, acceptAction }),
          memoryOutbox(),
        ),
      },
    );
    await waitFor(() => expect(result.current.suggestion).not.toBeNull());
    expect(result.current.origin).toMatch(
      /Drafted by Verida's AI \(claude-opus-5-5\)/,
    );
    expect(result.current.actions[0]).toMatchObject({
      verb: "Add task",
      heading: "Call buyers",
      open: true,
    });

    await act(async () => result.current.startEdit("a1"));
    await act(async () =>
      result.current.setDraftField("title", "Call two buyers"),
    );
    await act(async () => result.current.saveEdit());
    await waitFor(() =>
      expect(acceptAction).toHaveBeenCalledWith("a1", {
        title: "Call two buyers",
      }),
    );
    expect(mockFeedback.success).toHaveBeenCalledWith("Added to your plan.");
  });

  it("asks again with the same request and opens the new suggestion", async () => {
    const suggest = jest.fn(async () => ({
      suggestionId: "s2",
      source: "rules" as const,
    }));
    const onReplaced = jest.fn();
    const { result } = await renderHook(
      () => useSuggestionViewModel("s1", { onReplaced }),
      {
        wrapper: wrapperFor(
          fakePlan({ getSuggestion: async () => SUGGESTION }),
          memoryOutbox(),
          { suggest },
        ),
      },
    );
    await waitFor(() => expect(result.current.canRegenerate).toBe(true));
    await act(async () => result.current.regenerate());
    await waitFor(() => expect(onReplaced).toHaveBeenCalledWith("s2"));
    expect(suggest).toHaveBeenCalledWith({
      businessId: "biz-1",
      kind: "weekly_plan",
      goalId: null,
      request: "Free mornings",
    });
    expect(mockFeedback.success).toHaveBeenCalledWith(
      expect.stringMatching(/built-in planning rules/),
    );
  });
});
