import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useForm } from '@/core/forms/useForm';
import { useFeedback } from '@/design-system';

import type { AccountStatus } from '../../domain/models';
import { changeEmailSchema, changePasswordSchema, profileSchema, verifyEmailSchema } from '../../domain/validation';
import { useAccountDependencies } from '../di';
import { useCurrentUser } from './useSession';

const STATUS_LABELS: Record<AccountStatus, string> = {
  pending_verification: 'Awaiting verification',
  active: 'Active',
  suspended: 'Suspended',
  deactivated: 'Deactivated',
  deletion_requested: 'Deletion requested',
};

export function useProfileViewModel() {
  const { auth, profiles } = useAccountDependencies();
  const { userId } = useCurrentUser();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const queryKey = ['account', 'profile', userId];

  const profile = useQuery({ queryKey, queryFn: () => profiles.getProfile(userId) });
  const form = useForm(profileSchema, { fullName: '', phone: '' });
  const { reset } = form;
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (profile.data) reset({ fullName: profile.data.fullName, phone: profile.data.phone ?? '' });
  }, [profile.data, reset]);

  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const save = useMutation({
    mutationFn: (input: { fullName: string; phone: string | null }) => profiles.updateProfile(userId, input),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, updated);
      feedback.success('Your profile has been saved.');
    },
    ...report,
  });
  const signOut = useMutation({ mutationFn: () => auth.signOut(), ...report });
  // Deactivation also ends the session: this account can no longer use the workspace.
  const deactivate = useMutation({
    mutationFn: async () => {
      await profiles.deactivateAccount();
      await auth.signOut();
    },
    ...report,
  });
  const requestDeletion = useMutation({
    mutationFn: async () => {
      await profiles.requestAccountDeletion();
      await auth.signOut();
    },
    ...report,
  });

  return {
    loading: profile.isPending,
    loadError: profile.error ? errorMessage(profile.error) : null,
    retry: () => void profile.refetch(),
    email: profile.data?.email ?? '',
    statusLabel: profile.data ? STATUS_LABELS[profile.data.accountStatus] : '',
    isActive: profile.data?.accountStatus === 'active',
    form,
    fullName: profile.data?.fullName ?? '',
    phone: profile.data?.phone ?? null,
    editing,
    startEditing: () => setEditing(true),
    cancelEditing() {
      if (profile.data) form.reset({ fullName: profile.data.fullName, phone: profile.data.phone ?? '' });
      setEditing(false);
    },
    saving: save.isPending,
    save() {
      const input = form.validate();
      if (input) save.mutate(input, { onSuccess: () => setEditing(false) });
    },
    signOut: () => signOut.mutate(),
    signingOut: signOut.isPending,
    deactivate: () => deactivate.mutate(),
    requestDeletion: () => requestDeletion.mutate(),
    closingAccount: deactivate.isPending || requestDeletion.isPending,
  };
}

export function useAccountSecurityViewModel() {
  const { auth } = useAccountDependencies();
  const feedback = useFeedback();
  const passwordForm = useForm(changePasswordSchema, { newPassword: '' });
  const emailForm = useForm(changeEmailSchema, { newEmail: '' });
  const codeForm = useForm(verifyEmailSchema, { code: '' });
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const report = { onError: (error: unknown) => feedback.error(errorMessage(error)) };

  const changePassword = useMutation({
    mutationFn: (newPassword: string) => auth.changePassword(newPassword),
    onSuccess: () => {
      passwordForm.reset({ newPassword: '' });
      feedback.success('Your password has been changed.');
    },
    ...report,
  });
  const requestEmail = useMutation({
    mutationFn: (newEmail: string) => auth.requestEmailChange(newEmail),
    onSuccess: (_result, newEmail) => setPendingEmail(newEmail),
    ...report,
  });
  const confirmEmail = useMutation({
    mutationFn: ({ email, code }: { email: string; code: string }) => auth.confirmEmailChange(email, code),
    onSuccess: () => {
      setPendingEmail(null);
      emailForm.reset({ newEmail: '' });
      codeForm.reset({ code: '' });
      feedback.success('Your email address has been updated.');
    },
    ...report,
  });

  return {
    passwordForm,
    emailForm,
    codeForm,
    pendingEmail,
    busy: changePassword.isPending || requestEmail.isPending || confirmEmail.isPending,
    submitPassword() {
      const input = passwordForm.validate();
      if (input) changePassword.mutate(input.newPassword);
    },
    submitEmail() {
      const input = emailForm.validate();
      if (input) requestEmail.mutate(input.newEmail);
    },
    submitCode() {
      const input = codeForm.validate();
      if (input && pendingEmail) confirmEmail.mutate({ email: pendingEmail, code: input.code });
    },
  };
}
