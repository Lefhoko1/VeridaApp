import type { SupabaseClient } from '@/core/supabase/client';
import { AppError } from '@/core/errors/AppError';

import { SupabaseLearnerProfileRepository, SupabaseLearningContentRepository, SupabaseLessonRepository, SupabaseLessonReviewRepository } from './data/SupabaseLearningRepositories';
import type { LearningDependencies } from './presentation/di';

export function createLearningDependencies(client: SupabaseClient): LearningDependencies {
  return {
    lessons: new SupabaseLessonRepository(client),
    learnerProfiles: new SupabaseLearnerProfileRepository(client),
    reviews: new SupabaseLessonReviewRepository(client),
    content: new SupabaseLearningContentRepository(client),
    currentUserId: async () => {
      const { data } = await client.auth.getSession();
      if (!data.session) throw new AppError('unauthenticated', 'Your session has ended. Please sign in again.');
      return data.session.user.id;
    },
  };
}

export { LearningDependenciesProvider } from './presentation/di';
export { LearnerProfileScreen, LearnScreen, LessonScreen } from './presentation/views/learnerScreens';
export { ContentFormScreen, ContentListScreen, ContentProfileScreen } from './presentation/views/contentScreens';
export { ReviewCentreScreen, ReviewLessonScreen } from './presentation/views/reviewScreens';
