import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Divider, List, Searchbar, Text } from 'react-native-paper';

import { AttachmentField, Button, ConfirmDialog, EmptyState, ErrorView, FormField, LabelValue, LoadingView, Panel, PermissionChecklist, Row, Screen, SectionHeader, SelectField, StatusPill, spacing, supporting, IconTile } from '@/design-system';

import { ROLE_OPTIONS } from '../../domain/validation';
import { useBusinessProfileViewModel, useChangeHistoryViewModel } from '../viewmodels/useBusinessProfileViewModel';
import { useMemberPermissionsViewModel, useMembersViewModel, useReceivedInvitationsViewModel } from '../viewmodels/useMembersViewModel';
import type { AssignableRole } from '../../domain/models';

type ProfileScreenProps = {
  onEdit: () => void;
  onOpenMembers: () => void;
  onOpenProducts: () => void;
  onOpenHistory: () => void;
  onCreateBusiness: () => void;
};

export function ChangeHistoryScreen() {
  const vm = useChangeHistoryViewModel();

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.retry} />;

  return (
    <Screen>
      <SectionHeader title="Change history" description="Who changed what in this business. This history cannot be edited." />
      {vm.items.length === 0 ? <EmptyState illustration="ledger" title="No changes recorded yet." /> : null}
      {vm.items.length > 0 ? (
        <Panel>
          {vm.items.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <Divider /> : null}
              <List.Item title={item.title} description={item.fields ? `${item.detail}\n${item.fields}` : item.detail} descriptionNumberOfLines={3} />
            </View>
          ))}
        </Panel>
      ) : null}
    </Screen>
  );
}

export function BusinessProfileScreen({ onEdit, onOpenMembers, onOpenProducts, onOpenHistory, onCreateBusiness }: ProfileScreenProps) {
  const vm = useBusinessProfileViewModel();
  const [confirm, setConfirm] = useState<'deactivate' | 'delete' | null>(null);
  const { business } = vm;

  return (
    <Screen>
      <ReceivedInvitations />
      <Panel>
        <SectionHeader
          title={business.name}
          description={vm.industryName}
          action={<StatusPill label={vm.statusLabel} tone={vm.isActive ? 'ok' : 'warn'} />}
        />
        {vm.canEdit || vm.logo.path ? (
        <AttachmentField
          label="Logo"
          hint={vm.canEdit ? 'Shown beside your business name. It is saved as soon as you choose it.' : undefined}
          shape="square"
          hasFile={Boolean(vm.logo.path)}
          previewUri={vm.logo.previewUri}
          isPdf={false}
          uploading={vm.logo.uploading}
          error={vm.logo.error}
          disabled={!vm.canEdit}
          onTakePhoto={vm.logo.takePhoto}
          onChoosePhoto={vm.logo.choosePhoto}
          onRemove={vm.logo.remove}
        />
        ) : null}
        <View style={styles.details}>
          <LabelValue half label="Stage" value={business.stage} />
          <LabelValue half label="Size" value={business.size} />
          <LabelValue half label="Location" value={[business.location, business.country].filter(Boolean).join(', ')} />
          <LabelValue half label="Currency" value={business.currency} />
          <LabelValue label="Reasons for using Verida" value={business.mainGoal ?? 'Not set'} />
          <LabelValue label="How information is kept" value={business.recordKeeping ?? 'Not set'} />
        </View>
        {vm.canEdit ? (
          <Button mode="contained" onPress={onEdit}>
            Edit profile
          </Button>
        ) : null}
      </Panel>

      <Panel>
        <List.Item title="Products and services" left={() => <IconTile icon="tag-outline" />} right={(props) => <List.Icon {...props} icon="chevron-right" />} onPress={onOpenProducts} />
        {vm.canViewMembers ? (
          <>
            <Divider />
            <List.Item title="Team members" left={() => <IconTile icon="account-group-outline" />} right={(props) => <List.Icon {...props} icon="chevron-right" />} onPress={onOpenMembers} />
          </>
        ) : null}
        {vm.canViewHistory ? (
          <>
            <Divider />
            <List.Item title="Change history" left={() => <IconTile icon="history" />} right={(props) => <List.Icon {...props} icon="chevron-right" />} onPress={onOpenHistory} />
          </>
        ) : null}
      </Panel>

      <Panel>
        <SectionHeader title="Your businesses" description="Switch workspace, or add another business." />
        {vm.otherWorkspaces.map((workspace) => (
          <List.Item key={workspace.id} title={workspace.name} description="Switch to this workspace" onPress={() => vm.switchTo(workspace.id)} right={(props) => <List.Icon {...props} icon="swap-horizontal" />} />
        ))}
        <Button mode="outlined" onPress={onCreateBusiness}>
          Add another business
        </Button>
      </Panel>

      {vm.isOwner ? (
        <Panel>
          <SectionHeader title="Business status" description="Deactivating pauses the workspace. Your records are kept." />
          <Row wrap>
            {vm.isActive ? (
              <Button onPress={() => setConfirm('deactivate')} disabled={vm.busy}>
                Deactivate business
              </Button>
            ) : (
              <Button onPress={vm.reactivate} disabled={vm.busy}>
                Reactivate business
              </Button>
            )}
            <Button onPress={() => setConfirm('delete')} disabled={vm.busy} textColor={supporting.error}>
              Request deletion
            </Button>
          </Row>
        </Panel>
      ) : null}

      <ConfirmDialog
        visible={confirm !== null}
        title={confirm === 'delete' ? 'Request permanent deletion?' : 'Deactivate this business?'}
        message={
          confirm === 'delete'
            ? 'The workspace closes immediately. Verida will delete it subject to ownership, retention and compliance rules.'
            : 'Team members lose access to records until you reactivate it.'
        }
        confirmLabel={confirm === 'delete' ? 'Request deletion' : 'Deactivate'}
        destructive
        busy={vm.busy}
        onDismiss={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm === 'delete') vm.requestDeletion();
          else vm.deactivate();
          setConfirm(null);
        }}
      />
    </Screen>
  );
}

function ReceivedInvitations() {
  const vm = useReceivedInvitationsViewModel();
  if (vm.invitations.length === 0) return null;
  return (
    <Panel tone="mint">
      <SectionHeader title="Invitations for you" />
      {vm.invitations.map((invitation) => (
        <View key={invitation.id} style={styles.invite}>
          <Text variant="bodyMedium">
            {invitation.businessName} invited you as {invitation.role}.
          </Text>
          <Row>
            <Button mode="contained" compact onPress={() => vm.accept(invitation.id)} disabled={vm.busy}>
              Accept
            </Button>
            <Button compact onPress={() => vm.decline(invitation.id)} disabled={vm.busy}>
              Decline
            </Button>
          </Row>
        </View>
      ))}
    </Panel>
  );
}

export function MemberPermissionsScreen({ userId }: { userId: string }) {
  const vm = useMemberPermissionsViewModel(userId);

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.retry} />;

  return (
    <Screen>
      <Panel>
        <SectionHeader
          title={vm.member?.fullName ?? 'Team member'}
          description={vm.canEdit ? 'Change what this person can do without changing their role. Changing their role later resets these.' : 'An owner always has every permission.'}
          action={vm.member ? <StatusPill label={vm.member.role} tone={vm.member.role === 'owner' ? 'ok' : 'neutral'} /> : undefined}
        />
        <PermissionChecklist items={vm.items} disabled={vm.busy || !vm.canEdit} onChange={vm.setPermission} onUseRoleDefault={vm.resetPermission} />
      </Panel>
    </Screen>
  );
}

export function MembersScreen({ onOpenMember }: { onOpenMember: (userId: string) => void }) {
  const vm = useMembersViewModel();

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.retry} />;

  return (
    <Screen>
      {vm.canManage ? (
        <Panel>
          <SectionHeader title="Invite a team member" description="They join when they accept, using this email address." />
          <FormField label="Email address" value={vm.inviteForm.values.email} onChangeText={(v) => vm.inviteForm.setValue('email', v)} error={vm.inviteForm.errors.email} autoCapitalize="none" keyboardType="email-address" />
          <SelectField label="Role" value={vm.inviteForm.values.role} options={ROLE_OPTIONS} onChange={(v) => vm.inviteForm.setValue('role', v)} error={vm.inviteForm.errors.role} />
          <Button mode="contained" onPress={vm.submitInvite} loading={vm.inviting} disabled={vm.inviting}>
            Send invitation
          </Button>
        </Panel>
      ) : null}

      <Panel>
        <SectionHeader title="Team members" />
        <Searchbar placeholder="Search by name or email" value={vm.search} onChangeText={vm.setSearch} style={styles.search} />
        {vm.members.length === 0 ? <EmptyState illustration={vm.search ? 'search' : 'people'} title={vm.search ? 'Nobody matches your search.' : 'No members yet.'} /> : null}
        {vm.members.map((member) => (
          <View key={member.userId} style={styles.member}>
            <Text variant="titleSmall">{member.fullName}</Text>
            <Text variant="bodySmall" style={styles.muted}>
              {member.email}
            </Text>
            {vm.canManage && member.role !== 'owner' ? (
              <>
                <SelectField label="Role" value={member.role} options={ROLE_OPTIONS} onChange={(role) => vm.changeRole(member.userId, role as AssignableRole)} />
                <Row wrap>
                  <Button compact onPress={() => onOpenMember(member.userId)}>
                    Permissions
                  </Button>
                  {vm.isOwner ? (
                    <Button compact onPress={() => vm.askToTransfer(member)}>
                      Make owner
                    </Button>
                  ) : null}
                  <Button compact onPress={() => vm.askToRemove(member)} textColor={supporting.error}>
                    Remove from business
                  </Button>
                </Row>
              </>
            ) : (
              <StatusPill label={member.role} tone={member.role === 'owner' ? 'ok' : 'neutral'} />
            )}
          </View>
        ))}
      </Panel>

      {vm.canManage && vm.invitations.length > 0 ? (
        <Panel>
          <SectionHeader title="Pending invitations" />
          {vm.invitations.map((invitation) => (
            <Row key={invitation.id}>
              <View style={styles.grow}>
                <Text variant="bodyMedium">{invitation.email}</Text>
                <Text variant="bodySmall" style={styles.muted}>
                  {invitation.role}
                </Text>
              </View>
              <Button compact onPress={() => vm.revokeInvitation(invitation.id)}>
                Withdraw
              </Button>
            </Row>
          ))}
        </Panel>
      ) : null}

      <ConfirmDialog
        visible={vm.removing !== null}
        title="Remove this member?"
        message={`${vm.removing?.fullName ?? 'This person'} will lose access to this business immediately.`}
        confirmLabel="Remove"
        destructive
        busy={vm.removeBusy}
        onDismiss={() => vm.askToRemove(null)}
        onConfirm={vm.confirmRemove}
      />
      <ConfirmDialog
        visible={vm.transferring !== null}
        title="Transfer ownership?"
        message={`${vm.transferring?.fullName ?? 'This person'} becomes the owner and you become a manager. Only the new owner can undo this.`}
        confirmLabel="Transfer ownership"
        destructive
        busy={vm.transferBusy}
        onDismiss={() => vm.askToTransfer(null)}
        onConfirm={vm.confirmTransfer}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  invite: { gap: spacing.sm },
  member: { gap: spacing.sm, paddingVertical: spacing.sm },
  muted: { color: supporting.mutedText },
  grow: { flex: 1, minWidth: 0 },
  search: { backgroundColor: supporting.white, borderWidth: 1, borderColor: supporting.line },
});
