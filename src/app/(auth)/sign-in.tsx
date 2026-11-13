import { router } from 'expo-router';

import { SignInScreen } from '@/modules/account';

export default function SignInRoute() {
  return (
    <SignInScreen
      onSignUp={() => router.push('/sign-up')}
      onForgotPassword={() => router.push('/forgot-password')}
      onUnverified={(email) => router.push({ pathname: '/verify-email', params: { email } })}
    />
  );
}
