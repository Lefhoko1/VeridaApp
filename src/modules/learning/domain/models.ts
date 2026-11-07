export type LessonStatus = 'pending_review' | 'changes_requested' | 'rejected' | 'published' | 'completed' | 'archived';
export type ReviewDecision = 'approve' | 'reject' | 'request_changes';
export type LearningFormat = 'reading' | 'practical' | 'short_summary';

export type LessonContent = {
  title: string;
  intro: string;
  example: string;
  challenge: string;
};

export type Lesson = LessonContent & {
  id: string;
  objective: string;
  status: LessonStatus;
  publishedAt: string | null;
  completedAt: string | null;
};

export type ReviewableLesson = Lesson & {
  contentId: string;
  businessId: string;
  businessContext: string;
  generatedBy: 'template' | 'ai';
  createdAt: string;
};

// What a learner may know about a lesson before it is approved: no content.
export type WeeklyLessonState = {
  lessonId: string;
  status: LessonStatus;
};

export type LearnerProfileStatus = 'active' | 'deactivated' | 'deletion_requested';

export type LearnerProfile = {
  goals: string[];
  topics: string[];
  preferredFormat: LearningFormat;
  status?: LearnerProfileStatus;
};

export type LessonResponse = {
  answer: string | null;
  rating: number | null;
  feedback: string | null;
};

// FR-F35: an activity, with this learner's answer if they have given one.
export type LessonActivity = {
  id: string;
  prompt: string;
  answer: string | null;
};

export type LessonSource = {
  title: string;
  topic: string;
  version: number;
  objective: string;
};

export type ContentStatus = 'draft' | 'approved' | 'archived';
export type ContentDifficulty = 'beginner' | 'intermediate' | 'advanced';

export type LearningContent = LessonContent & {
  id: string;
  industryCode: string | null;
  topic: string;
  difficulty: ContentDifficulty;
  objective: string;
  kpiCode: string | null;
  activities: string[];
  version: number;
  approvalStatus: ContentStatus;
};

export type LearningContentInput = LessonContent & {
  industryCode: string | null;
  topic: string;
  difficulty: ContentDifficulty;
  objective: string;
  kpiCode: string | null;
  activities: string[];
  approvalStatus: ContentStatus;
};

// Someone a lesson can be assigned to. A lesson always belongs to one of their businesses.
export type LearnerWorkspace = { userId: string; fullName: string; businessId: string; businessName: string };

export type ContentOption = { value: string; label: string };

export type LessonCompletion = {
  answer: string | null;
  rating: number | null;
  feedback: string | null;
};
