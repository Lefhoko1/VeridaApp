import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SegmentedButtons, Text } from 'react-native-paper';

import { Button, FormField, Notice, PasswordField, Screen, Stack, supporting, SceneHeader, Reveal, palette } from '@/design-system';

import type { EntryArea, EntryChoice } from '../../domain/entryChoice';
import { useForgotPasswordViewModel, useSignInViewModel, useSignUpViewModel, useVerifyEmailViewModel } from '../viewmodels/authViewModels';

const PASSWORD_HINT = 'At least 8 characters, with upper and lower case letters and a number.';

const SIGN_IN_AREAS = [
  { value: 'business', label: 'Business', accessibilityLabel: 'Sign in as a business user' },
  { value: 'team', label: 'Verida team', accessibilityLabel: 'Sign in as Verida team' },
];

const SIGN_IN_SUBTITLE: Record<EntryArea, string> = {
  business: 'Sign in to your business workspace. Your role in the business is set by its owner.',
  team: 'Sign in to the Verida team tools. Your access is set by a Verida administrator.',
};

const SIGN_UP_INTENTS = [
  { value: 'own_business', label: 'My business', accessibilityLabel: 'I run my own business' },
  { value: 'join_business', label: 'I was invited', accessibilityLabel: 'I was invited to join a business' },
  { value: 'verida_team', label: 'Verida team', accessibilityLabel: 'I work for Verida' },
];

const SIGN_UP_HELP: Record<EntryChoice, string> = {
  own_business: 'You will set up your business after you register, and become its owner.',
  join_business: 'Use the email address you were invited on. The business owner has already chosen your role.',
  verida_team: 'A Verida administrator must give you access after you register.',
};

function AuthLayout({ title, subtitle, error, children }: { title: string; subtitle: string; error: string | null; children: ReactNode }) {
  return (
    <Screen hero={<SceneHeader tagline="Your intelligent business companion" />}>
      <Reveal>
        <Stack>
          <Text variant="headlineSmall" style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            {subtitle}
          </Text>
          {error ? <Notice>{error}</Notice> : null}
          {children}
        </Stack>
      </Reveal>
    </Screen>
  );
}

export function SignInScreen({ onSignUp, onForgotPassword }: { onSignUp: () => void; onForgotPassword: () => void }) {
  const vm = useSignInViewModel();
  const { values, errors, setValue } = vm.form;
  return (
    <AuthLayout title="Welcome back" subtitle={SIGN_IN_SUBTITLE[vm.area]} error={vm.error}>
      <SegmentedButtons value={vm.area} onValueChange={(value) => vm.setArea(value as EntryArea)} buttons={SIGN_IN_AREAS} />
      <FormField label="Email address" value={values.email} onChangeText={(v) => setValue('email', v)} error={errors.email} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <PasswordField label="Password" value={values.password} onChangeText={(v) => setValue('password', v)} error={errors.password} autoComplete="current-password" onSubmitEditing={vm.submit} />
      <Button mode="contained" onPress={vm.submit} loading={vm.busy} disabled={vm.busy}>
        Sign in
      </Button>
      <Button onPress={onForgotPassword}>Forgot your password?</Button>
      <Button mode="outlined" onPress={onSignUp}>
        Create an account
      </Button>
    </AuthLayout>
  );
}

export function SignUpScreen({ onRegistered, onSignIn }: { onRegistered: (email: string) => void; onSignIn: () => void }) {
  const vm = useSignUpViewModel(onRegistered);
  const { values, errors, setValue } = vm.form;
  return (
    <AuthLayout title="Create your account" subtitle="How will you use Verida?" error={vm.error}>
      <SegmentedButtons value={vm.intent} onValueChange={(value) => vm.setIntent(value as EntryChoice)} buttons={SIGN_UP_INTENTS} />
      <Notice tone="info">{SIGN_UP_HELP[vm.intent]}</Notice>
      <FormField label="Your name" value={values.fullName} onChangeText={(v) => setValue('fullName', v)} error={errors.fullName} autoComplete="name" />
      <FormField label="Email address" value={values.email} onChangeText={(v) => setValue('email', v)} error={errors.email} autoCapitalize="none" autoComplete="email" keyboardType="email-address" />
      <PasswordField label="Password" value={values.password} onChangeText={(v) => setValue('password', v)} error={errors.password} hint={PASSWORD_HINT} autoComplete="new-password" />
      <Button mode="contained" onPress={vm.submit} loading={vm.busy} disabled={vm.busy}>
        Create account
      </Button>
      <Button onPress={onSignIn}>I already have an account</Button>
    </AuthLayout>
  );
}

export function VerifyEmailScreen({ email, onSignIn }: { email: string; onSignIn: () => void }) {
  const vm = useVerifyEmailViewModel(email);
  return (
    <AuthLayout title="Verify your email" subtitle={`Enter the 6-digit code we sent to ${vm.email}.`} error={vm.error}>
      <FormField label="Verification code" value={vm.form.values.code} onChangeText={(v) => vm.form.setValue('code', v)} error={vm.form.errors.code} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" />
      <Button mode="contained" onPress={vm.submit} loading={vm.busy} disabled={vm.busy}>
        Verify and continue
      </Button>
      <Button onPress={vm.resend} loading={vm.resending} disabled={vm.resending}>
        Send a new code
      </Button>
      <Button onPress={onSignIn}>Back to sign in</Button>
    </AuthLayout>
  );
}

export function ForgotPasswordScreen({ onBack }: { onBack: () => void }) {
  const vm = useForgotPasswordViewModel();

  if (vm.step === 'request') {
    const { values, errors, setValue } = vm.emailForm;
    return (
      <AuthLayout title="Reset your password" subtitle="We will email you a 6-digit code." error={vm.error}>
        <FormField label="Email address" value={values.email} onChangeText={(v) => setValue('email', v)} error={errors.email} autoCapitalize="none" keyboardType="email-address" />
        <Button mode="contained" onPress={vm.requestCode} loading={vm.busy} disabled={vm.busy}>
          Send code
        </Button>
        <Button onPress={onBack}>Back to sign in</Button>
      </AuthLayout>
    );
  }

  const { values, errors, setValue } = vm.resetForm;
  return (
    <AuthLayout title="Choose a new password" subtitle={`Enter the code we sent to ${values.email}.`} error={vm.error}>
      <FormField label="Code" value={values.code} onChangeText={(v) => setValue('code', v)} error={errors.code} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" />
      <PasswordField label="New password" value={values.newPassword} onChangeText={(v) => setValue('newPassword', v)} error={errors.newPassword} hint={PASSWORD_HINT} autoComplete="new-password" />
      <Button mode="contained" onPress={vm.submitReset} loading={vm.busy} disabled={vm.busy}>
        Update password
      </Button>
    </AuthLayout>
  );
}

const styles = StyleSheet.create({
  title: { color: palette.deepTeal },
  subtitle: { color: supporting.mutedText },
});
