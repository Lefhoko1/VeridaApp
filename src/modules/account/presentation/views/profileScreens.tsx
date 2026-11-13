import { useState } from 'react';


import { Button, ConfirmDialog, ErrorView, FormField, LabelValue, LoadingView, Notice, Panel, PasswordField, Row, Screen, SectionHeader, StatusPill, SceneHeader } from '@/design-system';

import { useAccountAccess } from '../viewmodels/useAccountAccess';
import { useAccountSecurityViewModel, useProfileViewModel } from '../viewmodels/useProfileViewModel';

type PendingClosure = 'deactivate' | 'delete' | null;

export function ProfileScreen({ onOpenSecurity, onOpenPlatform }: { onOpenSecurity: () => void; onOpenPlatform?: () => void }) {
  const vm = useProfileViewModel();
  const [pending, setPending] = useState<PendingClosure>(null);

  if (vm.loading) return <LoadingView />;
  if (vm.loadError) return <ErrorView message={vm.loadError} onRetry={vm.retry} />;

  const { values, errors, setValue } = vm.form;
  return (
    <Screen>
      <Panel>
        <SectionHeader title="Account" action={<StatusPill label={vm.statusLabel} tone={vm.isActive ? 'ok' : 'warn'} />} />
        <LabelValue label="Email address" value={vm.email} />
        <Button mode="outlined" onPress={onOpenSecurity}>
          Change email or password
        </Button>
      </Panel>

      <Panel>
        <SectionHeader
          title="Personal details"
          action={
            vm.editing ? undefined : (
              <Button compact icon="pencil-outline" onPress={vm.startEditing}>
                Edit
              </Button>
            )
          }
        />
        {vm.editing ? (
          <>
        <FormField label="Your name" value={values.fullName} onChangeText={(v) => setValue('fullName', v)} error={errors.fullName} />
        <FormField label="Phone (optional)" value={values.phone} onChangeText={(v) => setValue('phone', v)} error={errors.phone} keyboardType="phone-pad" />
        <Button mode="contained" onPress={vm.save} loading={vm.saving} disabled={vm.saving}>
          Save changes
        </Button>
        <Button onPress={vm.cancelEditing} disabled={vm.saving}>
          Cancel
        </Button>
          </>
        ) : (
          <>
            <LabelValue label="Your name" value={vm.fullName} />
            <LabelValue label="Phone" value={vm.phone ?? 'Not set'} />
          </>
        )}
      </Panel>

      {onOpenPlatform ? (
        <Button mode="contained-tonal" icon="shield-account-outline" onPress={onOpenPlatform}>
          Verida platform
        </Button>
      ) : null}

      <Button mode="outlined" onPress={vm.signOut} loading={vm.signingOut} disabled={vm.signingOut}>
        Sign out
      </Button>

      <Panel>
        <SectionHeader title="Close account" description="If you own a business, transfer it to a team member or deactivate it first." />
        <Row wrap>
          <Button onPress={() => setPending('deactivate')}>Deactivate account</Button>
          <Button onPress={() => setPending('delete')}>Request deletion</Button>
        </Row>
      </Panel>

      <ConfirmDialog
        visible={pending !== null}
        title={pending === 'delete' ? 'Request account deletion?' : 'Deactivate your account?'}
        message={
          pending === 'delete'
            ? 'You will be signed out. Verida can erase your account once the retention period ends, and you can ask support to cancel until then.'
            : 'You will be signed out and will need Verida support to reactivate your account.'
        }
        confirmLabel={pending === 'delete' ? 'Request deletion' : 'Deactivate'}
        destructive
        busy={vm.closingAccount}
        onDismiss={() => setPending(null)}
        onConfirm={() => {
          // The dialog closes either way, so a refusal shows its reason with nothing in front of it.
          if (pending === 'delete') vm.requestDeletion();
          else vm.deactivate();
          setPending(null);
        }}
      />
    </Screen>
  );
}

export function AccountBlockedScreen({ message }: { message: string }) {
  const vm = useAccountAccess();
  return (
    <Screen hero={<SceneHeader />}>
      <Notice title="Your account is not active">{message}</Notice>
      <Button mode="outlined" onPress={vm.signOut} loading={vm.signingOut} disabled={vm.signingOut}>
        Sign out
      </Button>
    </Screen>
  );
}

export function AccountSecurityScreen() {
  const vm = useAccountSecurityViewModel();
  return (
    <Screen variant="form">
      <Panel>
        <SectionHeader title="Change password" />
        <PasswordField
          label="New password"
          value={vm.passwordForm.values.newPassword}
          onChangeText={(v) => vm.passwordForm.setValue('newPassword', v)}
          error={vm.passwordForm.errors.newPassword}
          autoComplete="new-password"
        />
        <Button mode="contained" onPress={vm.submitPassword} disabled={vm.busy}>
          Update password
        </Button>
      </Panel>

      <Panel>
        <SectionHeader title="Change email address" description="We will send a code to the new address to confirm it." />
        {vm.pendingEmail ? (
          <>
            <FormField
              label={`Code sent to ${vm.pendingEmail}`}
              value={vm.codeForm.values.code}
              onChangeText={(v) => vm.codeForm.setValue('code', v)}
              error={vm.codeForm.errors.code}
              keyboardType="number-pad"
              maxLength={6}
            />
            <Button mode="contained" onPress={vm.submitCode} disabled={vm.busy}>
              Confirm new email
            </Button>
          </>
        ) : (
          <>
            <FormField
              label="New email address"
              value={vm.emailForm.values.newEmail}
              onChangeText={(v) => vm.emailForm.setValue('newEmail', v)}
              error={vm.emailForm.errors.newEmail}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Button mode="contained" onPress={vm.submitEmail} disabled={vm.busy}>
              Send confirmation code
            </Button>
          </>
        )}
      </Panel>
    </Screen>
  );
}
