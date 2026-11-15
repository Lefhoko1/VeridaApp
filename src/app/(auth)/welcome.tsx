import { router } from 'expo-router';

import { LandingScreen } from '@/modules/account';

export default function WelcomeRoute() {
  return <LandingScreen onGetStarted={() => router.push('/sign-up')} onSignIn={() => router.push('/sign-in')} />;
}
