import { router, useLocalSearchParams } from 'expo-router';

import { VerifyEmailScreen } from '@/modules/account';

export default function VerifyEmailRoute() {
  const { email } = useLocalSearchParams<{ email: string }>();
  return <VerifyEmailScreen email={email} onSignIn={() => router.replace('/sign-in')} />;
}
