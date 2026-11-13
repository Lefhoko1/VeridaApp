import { useMutation } from '@tanstack/react-query';

import { errorMessage } from '@/core/errors/AppError';
import { useForm } from '@/core/forms/useForm';
import { useFeedback } from '@/design-system';

import { areaOf, choiceFor, type EntryArea, type EntryChoice } from '../../domain/entryChoice';
import { EmailNotVerifiedError } from '../../domain/errors';
import { forgotPasswordSchema, resetPasswordSchema, signInSchema, signUpSchema, verifyEmailSchema } from '../../domain/validation';
import { useAccountDependencies } from '../di';
import { useEntryChoice } from './useEntryChoice';

export function useSignInViewModel(onUnverified: (email: string) => void) {
  const { auth } = useAccountDependencies();
  const { choice, setChoice } = useEntryChoice();
  const form = useForm(signInSchema, { email: '', password: '' });
  const mutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => auth.signIn(email, password),
    onError: (error, { email }) => {
      if (!(error instanceof EmailNotVerifiedError)) return;
      // The first code may have expired or been lost, so send a fresh one. If that fails, for example
      // on the resend rate limit, the code screen can still send another.
      void auth.resendVerification(email).catch(() => undefined);
      onUnverified(email);
    },
  });
  const failure = mutation.error instanceof EmailNotVerifiedError ? null : mutation.error;

  return {
    form,
    area: areaOf(choice),
    setArea: (area: EntryArea) => setChoice(choiceFor(area)),
    busy: mutation.isPending,
    error: failure ? errorMessage(failure) : null,
    // The session listener moves the user on after a successful sign-in.
    submit() {
      const input = form.validate();
      if (input) mutation.mutate(input);
    },
  };
}

export function useSignUpViewModel(onRegistered: (email: string) => void) {
  const { auth } = useAccountDependencies();
  const { choice, setChoice } = useEntryChoice();
  const intent: EntryChoice = choice ?? 'own_business';
  const form = useForm(signUpSchema, { fullName: '', email: '', password: '' });
  const mutation = useMutation({
    mutationFn: (input: { fullName: string; email: string; password: string }) => auth.signUp(input),
    onSuccess: (_result, input) => {
      setChoice(intent);
      onRegistered(input.email);
    },
  });

  return {
    form,
    intent,
    setIntent: setChoice,
    busy: mutation.isPending,
    error: mutation.error ? errorMessage(mutation.error) : null,
    submit() {
      const input = form.validate();
      if (input) mutation.mutate(input);
    },
  };
}

export function useVerifyEmailViewModel(email: string) {
  const { auth } = useAccountDependencies();
  const feedback = useFeedback();
  const form = useForm(verifyEmailSchema, { code: '' });
  const verify = useMutation({ mutationFn: (code: string) => auth.verifySignUp(email, code) });
  const resend = useMutation({
    mutationFn: () => auth.resendVerification(email),
    onSuccess: () => feedback.success('We sent you a new code.'),
    onError: (error) => feedback.error(errorMessage(error)),
  });

  return {
    email,
    form,
    busy: verify.isPending,
    resending: resend.isPending,
    error: verify.error ? errorMessage(verify.error) : null,
    submit() {
      const input = form.validate();
      if (input) verify.mutate(input.code);
    },
    resend: () => resend.mutate(),
  };
}

export function useForgotPasswordViewModel() {
  const { auth } = useAccountDependencies();
  const feedback = useFeedback();
  const emailForm = useForm(forgotPasswordSchema, { email: '' });
  const resetForm = useForm(resetPasswordSchema, { email: '', code: '', newPassword: '' });

  const request = useMutation({
    mutationFn: (email: string) => auth.requestPasswordReset(email),
    onSuccess: (_result, email) => resetForm.setValue('email', email),
  });
  const reset = useMutation({
    mutationFn: (input: { email: string; code: string; newPassword: string }) => auth.resetPassword(input),
    onSuccess: () => feedback.success('Your password has been updated.'),
  });

  return {
    step: request.isSuccess ? ('reset' as const) : ('request' as const),
    emailForm,
    resetForm,
    busy: request.isPending || reset.isPending,
    error: request.error || reset.error ? errorMessage(request.error ?? reset.error) : null,
    requestCode() {
      const input = emailForm.validate();
      if (input) request.mutate(input.email);
    },
    submitReset() {
      const input = resetForm.validate();
      if (input) reset.mutate(input);
    },
  };
}
