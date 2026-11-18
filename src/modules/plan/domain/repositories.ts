import type { Goal, GoalInput, GoalProgress, KpiOption, Milestone, PlanOverview, ProgressEntry, Task, TaskInput } from './models';

export interface PlanRepository {
  overview(businessId: string, period: { from: string; to: string }): Promise<PlanOverview>;
  listTasks(businessId: string): Promise<Task[]>;
  getTask(id: string): Promise<Task>;
  createTask(businessId: string, input: TaskInput): Promise<string>;
  updateTask(businessId: string, id: string, input: TaskInput): Promise<void>;
  listGoals(businessId: string): Promise<Goal[]>;
  getGoal(id: string): Promise<Goal>;
  goalProgress(goalId: string): Promise<GoalProgress>;
  createGoal(businessId: string, input: GoalInput): Promise<string>;
  updateGoal(id: string, input: GoalInput): Promise<void>;
  addProgress(businessId: string, goalId: string, entry: ProgressEntry): Promise<void>;
  listMilestones(goalId: string): Promise<Milestone[]>;
  addMilestone(businessId: string, goalId: string, input: { title: string; dueOn: string | null; sortOrder: number }): Promise<void>;
  setMilestoneStatus(id: string, status: Milestone['status']): Promise<void>;
  removeMilestone(id: string): Promise<void>;
  kpiOptions(businessId: string): Promise<KpiOption[]>;
}
