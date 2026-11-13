import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Divider, List, Searchbar, Text } from 'react-native-paper';

import { formatDate } from '@/core/format/format';
import { CURRENCY_OPTIONS } from '@/core/geo/countries';
import { Button, ConfirmDialog, DataTable, DateField, EmptyState, FieldGrid, ErrorView, FormField, LabelValue, LoadingView, Panel, PermissionChecklist, Row, Screen, SectionHeader, SelectField, StatusPill, spacing, supporting, useWideLayout } from '@/design-system';

import { ACCOUNT_STATUS_OPTIONS, BUSINESS_STATUS_OPTIONS, MEMBER_ROLE_OPTIONS } from '../../domain/validation';
import { BUSINESS_TONE, useBusinessDetailViewModel, useBusinessMemberPermissionsViewModel, useBusinessSearchViewModel } from '../viewmodels/useBusinessAdminViewModels';
import { STATUS_TONE, useUserDetailViewModel, useUserSearchViewModel } from '../viewmodels/useUserAdminViewModels';

const label = (status: string) => status.replace(/_/g, ' ');

export function UserListScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const vm = useUserSearchViewModel();
  const wide = useWideLayout();
  return (
    <Screen>
      <SectionHeader title="Users" description="Search by name or email, and filter by status and registration date." />
      <FieldGrid>
        <Searchbar placeholder="Name or email" value={vm.query} onChangeText={vm.setQuery} style={styles.search} />
        <SelectField label="Account status" value={vm.status} options={ACCOUNT_STATUS_OPTIONS} onChange={vm.setStatus} />
        <Row gap={spacing.sm}>
          <View style={styles.half}>
            <DateField label="Registered from" value={vm.from} onChangeText={vm.setFrom} />
          </View>
          <View style={styles.half}>
            <DateField label="Registered to" value={vm.to} onChangeText={vm.setTo} />
          </View>
        </Row>
      </FieldGrid>
      {vm.loading ? (
        <LoadingView />
      ) : vm.error ? (
        <ErrorView message={vm.error} onRetry={vm.retry} />
      ) : vm.items.length === 0 ? (
        <EmptyState illustration="search" title="No users match." />
      ) : wide ? (
        <DataTable
          rows={vm.items}
          rowKey={(user) => user.id}
          onRowPress={(user) => onOpen(user.id)}
          rowLabel={(user) => user.fullName}
          columns={[
            { key: 'name', title: 'Name', render: (user) => <Text style={styles.strong}>{user.fullName}</Text>, flex: 1.6 },
            { key: 'email', title: 'Email', render: (user) => user.email, flex: 2 },
            { key: 'registered', title: 'Registered', render: (user) => formatDate(user.createdAt.slice(0, 10)) },
            { key: 'status', title: 'Status', render: (user) => <StatusPill label={label(user.accountStatus)} tone={STATUS_TONE[user.accountStatus]} /> },
          ]}
        />
      ) : (
        <Panel style={styles.list}>
          {vm.items.map((user, index) => (
            <View key={user.id}>
              {index > 0 ? <Divider /> : null}
              <List.Item
                title={user.fullName}
                description={`${user.email}\nRegistered ${formatDate(user.createdAt.slice(0, 10))}`}
                descriptionNumberOfLines={2}
                onPress={() => onOpen(user.id)}
                right={() => <StatusPill label={label(user.accountStatus)} tone={STATUS_TONE[user.accountStatus]} />}
              />
            </View>
          ))}
        </Panel>
      )}
    </Screen>
  );
}

export function UserDetailScreen({ userId }: { userId: string }) {
  const vm = useUserDetailViewModel(userId);

  if (vm.loading) return <LoadingView />;
  if (vm.error || !vm.user) return <ErrorView message={vm.error ?? 'This user could not be found.'} />;
  const { user } = vm;
  const { values, errors, setValue } = vm.form;

  return (
    <Screen>
      <Panel>
        <SectionHeader title={user.fullName} description={user.email} action={<StatusPill label={label(user.accountStatus)} tone={vm.statusTone} />} />
        <View style={styles.details}>
          <LabelValue half label="Email verified" value={user.emailConfirmed ? 'Yes' : 'No'} />
          <LabelValue half label="Registered" value={formatDate(user.createdAt.slice(0, 10))} />
          <LabelValue half label="Last sign-in" value={user.lastSignInAt ? formatDate(user.lastSignInAt.slice(0, 10)) : 'Never'} />
          <LabelValue half label="Businesses" value={String(user.businessCount)} />
          <LabelValue half label="Platform roles" value={user.platformRoles.map(label).join(', ') || 'None'} />
        </View>
      </Panel>
      {vm.isErased ? null : (
        <Panel>
          <SectionHeader
            title="Permitted details"
            description="Email and password stay under the user's control."
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
              <FormField label="Name" value={values.fullName} onChangeText={(v) => setValue('fullName', v)} error={errors.fullName} />
              <FormField label="Phone (optional)" value={values.phone} onChangeText={(v) => setValue('phone', v)} error={errors.phone} keyboardType="phone-pad" />
              <Button mode="contained" onPress={vm.save} disabled={vm.busy}>
                Save changes
              </Button>
              <Button onPress={vm.cancelEditing} disabled={vm.busy}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <LabelValue label="Name" value={values.fullName} />
              <LabelValue label="Phone" value={values.phone || 'Not set'} />
            </>
          )}
        </Panel>
      )}
      <Panel>
        <SectionHeader title="Account status" description="Suspending removes access to all business data immediately." />
        <Row wrap>
          {vm.canSuspend ? (
            <Button onPress={vm.suspend} disabled={vm.busy} textColor={supporting.error}>
              Suspend
            </Button>
          ) : null}
          {vm.canReactivate ? (
            <Button onPress={vm.reactivate} disabled={vm.busy}>
              Reactivate
            </Button>
          ) : null}
          {vm.canDelete ? (
            <Button onPress={vm.askToDelete} disabled={vm.busy} textColor={supporting.error}>
              Initiate deletion
            </Button>
          ) : null}
        </Row>
      </Panel>
      <ConfirmDialog
        visible={vm.confirmingDeletion}
        title="Initiate account deletion?"
        message="The account is flagged for deletion and loses access. It can be erased from the deletion queue once the retention period ends."
        confirmLabel="Initiate deletion"
        destructive
        busy={vm.busy}
        onDismiss={vm.cancelDelete}
        onConfirm={vm.confirmDelete}
      />
    </Screen>
  );
}

export function BusinessListScreen({ onOpen }: { onOpen: (id: string) => void }) {
  const vm = useBusinessSearchViewModel();
  const wide = useWideLayout();
  return (
    <Screen>
      <SectionHeader title="Businesses" description="Search by name, and filter by industry, location and status." />
      <FieldGrid>
        <Searchbar placeholder="Business name" value={vm.query} onChangeText={vm.setQuery} style={styles.search} />
        <SelectField label="Industry" value={vm.industry} options={vm.industryOptions} onChange={vm.setIndustry} />
        <FormField label="Location" value={vm.location} onChangeText={vm.setLocation} />
        <SelectField label="Status" value={vm.status} options={BUSINESS_STATUS_OPTIONS} onChange={vm.setStatus} />
      </FieldGrid>
      {vm.loading ? (
        <LoadingView />
      ) : vm.error ? (
        <ErrorView message={vm.error} onRetry={vm.retry} />
      ) : vm.items.length === 0 ? (
        <EmptyState illustration="search" title="No businesses match." />
      ) : wide ? (
        <DataTable
          rows={vm.items}
          rowKey={(business) => business.id}
          onRowPress={(business) => onOpen(business.id)}
          rowLabel={(business) => business.name}
          columns={[
            { key: 'name', title: 'Business', render: (business) => <Text style={styles.strong}>{business.name}</Text>, flex: 1.6 },
            { key: 'industry', title: 'Industry', render: (business) => business.industryCode },
            { key: 'location', title: 'Location', render: (business) => [business.location, business.country].filter(Boolean).join(', ') || '—', flex: 1.4 },
            { key: 'owner', title: 'Owner', render: (business) => business.ownerEmail ?? 'None', flex: 1.8 },
            { key: 'members', title: 'Members', render: (business) => String(business.memberCount), align: 'right', flex: 0.8 },
            { key: 'status', title: 'Status', render: (business) => <StatusPill label={label(business.status)} tone={BUSINESS_TONE[business.status]} /> },
          ]}
        />
      ) : (
        <Panel style={styles.list}>
          {vm.items.map((business, index) => (
            <View key={business.id}>
              {index > 0 ? <Divider /> : null}
              <List.Item
                title={business.name}
                description={`${business.industryCode} · ${[business.location, business.country].filter(Boolean).join(', ')}\nOwner: ${business.ownerEmail ?? 'None'} · ${business.memberCount} members`}
                descriptionNumberOfLines={2}
                onPress={() => onOpen(business.id)}
                right={() => <StatusPill label={label(business.status)} tone={BUSINESS_TONE[business.status]} />}
              />
            </View>
          ))}
        </Panel>
      )}
    </Screen>
  );
}

export function BusinessMemberPermissionsScreen({ businessId, userId }: { businessId: string; userId: string }) {
  const vm = useBusinessMemberPermissionsViewModel(businessId, userId);

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.retry} />;

  return (
    <Screen>
      <Panel>
        <SectionHeader title={vm.member?.fullName ?? 'Team member'} description={vm.canEdit ? 'Change what this person can do in this business without changing their role.' : 'An owner always has every permission.'} />
        <PermissionChecklist items={vm.items} disabled={vm.busy || !vm.canEdit} onChange={vm.setPermission} onUseRoleDefault={vm.resetPermission} />
      </Panel>
    </Screen>
  );
}

export function BusinessDetailScreen({ businessId, onOpenMember }: { businessId: string; onOpenMember: (userId: string) => void }) {
  const vm = useBusinessDetailViewModel(businessId);
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  if (vm.loading) return <LoadingView />;
  if (vm.error || !vm.business) return <ErrorView message={vm.error ?? 'This business could not be found.'} />;
  const { business } = vm;
  const { values, errors, setValue } = vm.form;

  return (
    <Screen>
      <Panel>
        <SectionHeader title={business.name} description={business.ownerEmail ?? 'No owner'} action={<StatusPill label={label(business.status)} tone={vm.statusTone} />} />
        <View style={styles.details}>
          <LabelValue half label="Location" value={[business.location, business.country].filter(Boolean).join(', ')} />
          <LabelValue half label="Members" value={String(business.memberCount)} />
          <LabelValue half label="Main goal" value={business.mainGoal ?? 'Not set'} />
          <LabelValue half label="Registered" value={formatDate(business.createdAt.slice(0, 10))} />
        </View>
      </Panel>
      <Panel>
        <SectionHeader
          title="Configuration"
          description="The owner controls the name, goals and location."
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
        <SelectField label="Main industry" value={values.industryCode} options={vm.industryOptions} onChange={(v) => setValue('industryCode', v)} error={errors.industryCode} />
        <FormField label="Stage" value={values.stage} onChangeText={(v) => setValue('stage', v)} error={errors.stage} />
        <FormField label="Size" value={values.size} onChangeText={(v) => setValue('size', v)} error={errors.size} />
        <SelectField label="Currency" value={values.currency} options={CURRENCY_OPTIONS} onChange={(v) => setValue('currency', v)} error={errors.currency} />
        <Button mode="contained" onPress={vm.save} disabled={vm.busy}>
          Save configuration
        </Button>
        <Button onPress={vm.cancelEditing} disabled={vm.busy}>
          Cancel
        </Button>
          </>
        ) : (
          <View style={styles.details}>
            <LabelValue half label="Main industry" value={vm.industryOptions.find((option) => option.value === values.industryCode)?.label ?? values.industryCode} />
            <LabelValue half label="Stage" value={values.stage} />
            <LabelValue half label="Size" value={values.size} />
            <LabelValue half label="Currency" value={values.currency} />
          </View>
        )}
      </Panel>
      <Panel>
        <SectionHeader title="Team" description="For when the team cannot sort this out itself, such as when an owner has left." />
        {vm.members.map((member) => (
          <View key={member.userId} style={styles.member}>
            <Row>
              <View style={styles.half}>
                <Text variant="titleSmall">{member.fullName}</Text>
                <Text variant="bodySmall" style={styles.muted}>
                  {member.email}
                </Text>
              </View>
              {member.role === 'owner' ? <StatusPill label="owner" tone="ok" /> : null}
            </Row>
            {member.role !== 'owner' ? (
              <>
                <SelectField label="Role" value={member.role} options={MEMBER_ROLE_OPTIONS} onChange={(role) => vm.changeMemberRole(member.userId, role)} />
                <Row wrap>
                  <Button compact onPress={() => onOpenMember(member.userId)} disabled={vm.busy}>
                    Permissions
                  </Button>
                  <Button compact onPress={() => vm.askToTransfer(member)} disabled={vm.busy}>
                    Make owner
                  </Button>
                  <Button compact onPress={() => vm.askToRemove(member)} disabled={vm.busy} textColor={supporting.error}>
                    Remove
                  </Button>
                </Row>
              </>
            ) : null}
          </View>
        ))}
      </Panel>
      <Panel>
        <SectionHeader title="Business status" description="Suspending pauses the whole workspace for its team." />
        <Row wrap>
          {vm.canSuspend ? (
            <Button onPress={() => setConfirmSuspend(true)} disabled={vm.busy} textColor={supporting.error}>
              Suspend business
            </Button>
          ) : null}
          {vm.canReactivate ? (
            <Button onPress={vm.reactivate} disabled={vm.busy}>
              Reactivate business
            </Button>
          ) : null}
          {vm.canDelete ? (
            <Button onPress={vm.askToDelete} disabled={vm.busy} textColor={supporting.error}>
              Initiate deletion
            </Button>
          ) : null}
        </Row>
      </Panel>
      <ConfirmDialog
        visible={confirmSuspend}
        title="Suspend this business?"
        message="Its team loses access to records and reports until you reactivate it."
        confirmLabel="Suspend"
        destructive
        busy={vm.busy}
        onDismiss={() => setConfirmSuspend(false)}
        onConfirm={() => {
          vm.suspend();
          setConfirmSuspend(false);
        }}
      />
      <ConfirmDialog
        visible={vm.confirmingDeletion}
        title="Initiate business deletion?"
        message="The workspace closes for its team. It can be erased from the deletion queue once the retention period ends."
        confirmLabel="Initiate deletion"
        destructive
        busy={vm.busy}
        onDismiss={vm.cancelDelete}
        onConfirm={vm.confirmDelete}
      />
      <ConfirmDialog
        visible={vm.removing !== null}
        title="Remove this member?"
        message={`${vm.removing?.fullName ?? 'This person'} loses access to this business immediately.`}
        confirmLabel="Remove"
        destructive
        busy={vm.busy}
        onDismiss={() => vm.askToRemove(null)}
        onConfirm={vm.confirmRemove}
      />
      <ConfirmDialog
        visible={vm.transferring !== null}
        title="Transfer ownership?"
        message={`${vm.transferring?.fullName ?? 'This person'} becomes the owner, and any current owner becomes a manager.`}
        confirmLabel="Transfer ownership"
        destructive
        busy={vm.busy}
        onDismiss={() => vm.askToTransfer(null)}
        onConfirm={vm.confirmTransfer}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: '600' },
  search: { backgroundColor: supporting.white, borderWidth: 1, borderColor: supporting.line },
  list: { padding: spacing.xs, gap: 0 },
  half: { flex: 1, minWidth: 0 },
  details: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  member: { gap: spacing.sm, paddingVertical: spacing.sm },
  muted: { color: supporting.mutedText },
});
