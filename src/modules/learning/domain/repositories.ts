import type {
  ContentOption,
  ContentStatus,
  LearnerProfile,
  LearnerProfileStatus,
  LearnerWorkspace,
  LearningContent,
  LearningContentInput,
  Lesson,
  LessonActivity,
  LessonCompletion,
  LessonContent,
  LessonResponse,
  LessonSource,
  LessonStatus,
  ReviewableLesson,
  ReviewDecision,
  WeeklyLessonState,
} from './models';

export interface LessonRepository {
  requestWeeklyLesson(businessId: string): Promise<void>;
  weeklyState(businessId: string): Promise<WeeklyLessonState | null>;
  listMine(businessId: string): Promise<Lesson[]>;
  get(id: string): Promise<Lesson>;
  complete(id: string, completion: LessonCompletion): Promise<void>;
  getResponse(lessonId: string): Promise<LessonResponse | null>;
  correctResponse(lessonId: string, response: LessonCompletion): Promise<void>;
  deleteResponse(lessonId: string): Promise<void>;
  listActivities(lessonId: string): Promise<LessonActivity[]>;
  submitActivity(activityId: string, answer: string): Promise<void>;
}

export interface LearnerProfileRepository {
  get(userId: string): Promise<LearnerProfile | null>;
  save(userId: string, profile: LearnerProfile): Promise<void>;
  setStatus(status: LearnerProfileStatus): Promise<void>;
}

export interface LessonReviewRepository {
  canReview(): Promise<boolean>;
  list(filter: { status: LessonStatus; search?: string }): Promise<ReviewableLesson[]>;
  get(id: string): Promise<ReviewableLesson>;
  getSource(contentId: string): Promise<LessonSource>;
  edit(id: string, content: LessonContent): Promise<void>;
  decide(id: string, decision: ReviewDecision, comments: string | null): Promise<void>;
  regenerate(id: string, comments: string | null): Promise<void>;
  archive(id: string): Promise<void>;
  listActivities(lessonId: string): Promise<LessonActivity[]>;
  setActivities(lessonId: string, prompts: string[]): Promise<void>;
  getResponse(lessonId: string): Promise<LessonResponse | null>;
  deleteResponse(lessonId: string): Promise<void>;
}

export interface LearningContentRepository {
  list(filter: { search?: string; status?: ContentStatus }): Promise<LearningContent[]>;
  get(id: string): Promise<LearningContent>;
  create(input: LearningContentInput): Promise<void>;
  update(id: string, input: LearningContentInput): Promise<void>;
  setStatus(id: string, status: ContentStatus): Promise<void>;
  industryOptions(): Promise<ContentOption[]>;
  kpiOptions(): Promise<ContentOption[]>;
  learnerWorkspaces(email: string): Promise<LearnerWorkspace[]>;
  assign(contentId: string, learnerId: string, businessId: string): Promise<void>;
}
