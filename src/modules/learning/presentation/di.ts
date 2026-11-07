import { createDependencies } from '@/core/di/createDependencies';

import type { LearnerProfileRepository, LearningContentRepository, LessonRepository, LessonReviewRepository } from '../domain/repositories';

export type LearningDependencies = {
  lessons: LessonRepository;
  learnerProfiles: LearnerProfileRepository;
  reviews: LessonReviewRepository;
  content: LearningContentRepository;
  currentUserId: () => Promise<string>;
};

export const { Provider: LearningDependenciesProvider, useDependencies: useLearningDependencies } =
  createDependencies<LearningDependencies>('Learning');
