import { router } from 'expo-router';

import { SignUpScreen } from '@/modules/account';

export default function SignUpRoute() {
  return (
    <SignUpScreen
      onRegistered={(email) => router.replace({ pathname: '/verify-email', params: { email } })}
      onSignIn={() => router.replace('/sign-in')}
    />
  );
}
