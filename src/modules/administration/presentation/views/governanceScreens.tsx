import { StyleSheet, View } from 'react-native';
import { Divider, IconButton, List, Switch, Text } from 'react-native-paper';

import { formatDate } from '@/core/format/format';
import { DATE_RANGE_OPTIONS } from '@/core/time/dateRange';
import { Button, ConfirmDialog, EmptyState, ErrorView, FormField, LoadingView, MetricCard, MetricGrid, Notice, Panel, PermissionChecklist, Row, Screen, SectionHeader, SelectField, StatusPill, spacing, supporting, IconTile } from '@/design-system';

import { useAccountAccess } from '@/modules/account';

import { ROLE_OPTIONS } from '../../domain/validation';
import { useAiLogsViewModel, useAuditViewModel, useDeletionQueueViewModel, useMonitoringViewModel, useRolesViewModel, useStaffPermissionsViewModel } from '../viewmodels/useGovernanceViewModels';

const when = (timestamp: string) => `${formatDate(timestamp.slice(0, 10))} ${timestamp.slice(11, 16)}`;

type HubEntry = { title: string; description: string; icon: string; onPress: () => void };

export function PlatformHubScreen({ entries, setupAction, workspaceAction }: { entries: HubEntry[]; setupAction?: () => void; workspaceAction?: () => void }) {
  const account = useAccountAccess();
  return (
    <Screen>
      <SectionHeader title="Verida platform" description="Tools for the Verida team." />
      <Panel style={styles.list}>
        {entries.map((entry, index) => (
          <View key={entry.title}>
            {index > 0 ? <Divider /> : null}
            <List.Item
              title={entry.title}
              description={entry.description}
              onPress={entry.onPress}
              left={() => <IconTile icon={entry.icon} />}
              right={(props) => <List.Icon {...props} icon="chevron-right" />}
            />
          </View>
        ))}
      </Panel>
      {setupAction ? (
        <Button mode="outlined" onPress={setupAction}>
          Set up a business workspace
        </Button>
      ) : null}
      {workspaceAction ? (
        <Button mode="outlined" onPress={workspaceAction}>
          Open my business workspace
        </Button>
      ) : null}
      <Button onPress={account.signOut} loading={account.signingOut} disabled={account.signingOut}>
        Sign out
      </Button>
    </Screen>
  );
}

export function RolesScreen({ onOpenStaff }: { onOpenStaff: (userId: string) => void }) {
  const vm = useRolesViewModel();

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.retry} />;
  const { values, errors, setValue } = vm.form;

  return (
    <Screen>
      <Panel>
        <SectionHeader title="Grant a platform role" description="The person needs a Verida account already." />
        <FormField label="Email address" value={values.email} onChangeText={(v) => setValue('email', v)} error={errors.email} autoCapitalize="none" keyboardType="email-address" />
        <SelectField label="Role" value={values.role} options={ROLE_OPTIONS} onChange={(v) => setValue('role', v)} error={errors.role} />
        <Button mode="contained" onPress={vm.submitGrant} loading={vm.granting} disabled={vm.granting}>
          Grant role
        </Button>
      </Panel>

      <Panel>
        <SectionHeader title="Who holds a role" />
        {vm.assignments.length === 0 ? <EmptyState title="Nobody yet." /> : null}
        {vm.assignments.map((assignment) => (
          <Row key={`${assignment.userId}-${assignment.role}`}>
            <View style={styles.grow}>
              <Text variant="bodyMedium">{assignment.fullName}</Text>
              <Text style={styles.muted}>{assignment.email}</Text>
            </View>
            <StatusPill label={assignment.role.replace(/_/g, ' ')} tone={assignment.role === 'administrator' ? 'warn' : 'ok'} />
            <IconButton icon="tune-variant" size={18} onPress={() => onOpenStaff(assignment.userId)} accessibilityLabel={`Permissions for ${assignment.fullName}`} />
            <IconButton icon="close" size={18} onPress={() => vm.askToRevoke(assignment)} accessibilityLabel={`Remove role from ${assignment.fullName}`} />
          </Row>
        ))}
      </Panel>

      <Panel>
        <SectionHeader title="Verida staff role permissions" description="Administrators always hold every permission. Use the settings button beside a person to change just their access." />
        {vm.staffPermissions.map((permission) => (
          <View key={permission.code} style={styles.permission}>
            <Text variant="bodySmall" style={styles.permissionLabel}>
              {permission.description}
            </Text>
            <Row wrap gap={spacing.md}>
              {vm.staffRoles.map((role) => (
                <View key={role.code} style={styles.toggle}>
                  <Switch value={vm.isStaffGranted(role.code, permission.code)} disabled={vm.staffMatrixBusy} onValueChange={(on) => vm.setStaffRolePermission(role.code, permission.code, on)} accessibilityLabel={`${role.name}: ${permission.description}`} />
                  <Text style={styles.muted}>{role.name}</Text>
                </View>
              ))}
            </Row>
          </View>
        ))}
      </Panel>

      <Panel>
        <SectionHeader title="Business role permissions" description="Changes apply to every business immediately. Owners always hold every permission." />
        {vm.permissions.map((permission) => (
          <View key={permission.code} style={styles.permission}>
            <Text variant="bodySmall" style={styles.permissionLabel}>
              {permission.description}
            </Text>
            <Row wrap gap={spacing.md}>
              {vm.roles.map((role) => (
                <View key={role.code} style={styles.toggle}>
                  <Switch value={vm.isGranted(role.code, permission.code)} disabled={vm.matrixBusy} onValueChange={(on) => vm.setPermission(role.code, permission.code, on)} accessibilityLabel={`${role.name}: ${permission.description}`} />
                  <Text style={styles.muted}>{role.name}</Text>
                </View>
              ))}
            </Row>
          </View>
        ))}
      </Panel>

      <ConfirmDialog
        visible={vm.revoking !== null}
        title="Remove this role?"
        message={`${vm.revoking?.fullName ?? 'This person'} loses this access immediately.`}
        confirmLabel="Remove role"
        destructive
        busy={vm.revokeBusy}
        onDismiss={() => vm.askToRevoke(null)}
        onConfirm={vm.confirmRevoke}
      />
    </Screen>
  );
}

export function StaffPermissionsScreen({ userId }: { userId: string }) {
  const vm = useStaffPermissionsViewModel(userId);

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.retry} />;

  return (
    <Screen>
      <Panel>
        <SectionHeader title={vm.name} description={vm.isAdministrator ? 'An administrator always has every permission.' : `Role: ${vm.roles}. Change what this person can do without changing their role.`} />
        <PermissionChecklist items={vm.items} disabled={vm.busy || vm.isAdministrator} onChange={vm.setPermission} onUseRoleDefault={vm.resetPermission} />
      </Panel>
    </Screen>
  );
}

export function DeletionQueueScreen() {
  const vm = useDeletionQueueViewModel();

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.retry} />;
  const { values, errors, setValue } = vm.form;

  return (
    <Screen>
      <Panel>
        <SectionHeader title="Retention period" description="How long a request waits before it can be erased, so that it can still be cancelled." />
        <FormField label="Days" value={values.days} onChangeText={(v) => setValue('days', v)} error={errors.days} keyboardType="number-pad" />
        <Button mode="outlined" onPress={vm.saveRetention} disabled={vm.busy}>
          Save retention period
        </Button>
      </Panel>

      <Notice>Erasing cannot be undone. Before erasing a business, check that no law still requires its financial records to be kept.</Notice>

      <Panel>
        <SectionHeader title="Deletion requests" />
        {vm.items.length === 0 ? <EmptyState illustration="done" title="No requests are waiting." /> : null}
        {vm.items.map(({ request, kindLabel, canErase }, index) => (
          <View key={`${request.kind}-${request.id}`} style={styles.event}>
            {index > 0 ? <Divider /> : null}
            <Row>
              <View style={styles.grow}>
                <Text variant="titleSmall">{request.name}</Text>
                {request.detail ? <Text style={styles.muted}>{request.detail}</Text> : null}
              </View>
              <StatusPill label={kindLabel} tone="warn" />
            </Row>
            <Text variant="bodySmall">
              Requested {formatDate(request.requestedAt.slice(0, 10))}. {canErase ? 'The retention period has ended.' : `Can be erased from ${formatDate(request.erasableFrom.slice(0, 10))}.`}
            </Text>
            <Row wrap>
              <Button compact onPress={() => vm.cancelRequest(request)} disabled={vm.busy}>
                Cancel request
              </Button>
              {canErase ? (
                <Button compact onPress={() => vm.askToErase(request)} disabled={vm.busy} textColor={supporting.error}>
                  Erase permanently
                </Button>
              ) : null}
            </Row>
          </View>
        ))}
      </Panel>

      <ConfirmDialog
        visible={vm.erasing !== null}
        title={`Permanently erase ${vm.erasing?.name ?? 'this'}?`}
        message={
          vm.erasing?.kind === 'business'
            ? 'The business and all its records, including sales and expenses, are deleted for good. This cannot be undone.'
            : vm.erasing?.kind === 'account'
              ? 'Their personal details, conversations and lessons are deleted for good, and they can no longer sign in. Records they entered for a business stay, marked as entered by a deleted user. This cannot be undone.'
              : 'Their learning preferences and responses are deleted for good. This cannot be undone.'
        }
        confirmLabel="Erase permanently"
        destructive
        busy={vm.busy}
        onDismiss={() => vm.askToErase(null)}
        onConfirm={vm.confirmErase}
      />
    </Screen>
  );
}

const HEALTH_TONE = { up: 'ok', down: 'danger', not_configured: 'warn' } as const;
const HEALTH_LABEL = { up: 'Up', down: 'Down', not_configured: 'Not configured' } as const;
const SEVERITY_TONE = { info: 'neutral', warning: 'warn', error: 'danger' } as const;

export function MonitoringScreen() {
  const vm = useMonitoringViewModel();

  if (vm.loading) return <LoadingView />;
  if (vm.error) return <ErrorView message={vm.error} onRetry={vm.refresh} />;

  return (
    <Screen refreshing={vm.refreshing} onRefresh={vm.refresh}>
      <Panel>
        <SectionHeader title="Service availability" description="Checked from this device just now." />
        {vm.checkingServices ? <LoadingView /> : null}
        {vm.services.map((service) => (
          <Row key={service.name}>
            <View style={styles.grow}>
              <Text variant="bodyMedium">{service.name}</Text>
              <Text style={styles.muted}>{service.detail ?? (service.latencyMs !== null ? `${service.latencyMs} ms` : '')}</Text>
            </View>
            <StatusPill label={HEALTH_LABEL[service.status]} tone={HEALTH_TONE[service.status]} />
          </Row>
        ))}
      </Panel>

      <SectionHeader title="Platform usage" />
      <MetricGrid>
        {vm.stats.map((stat) => (
          <MetricCard key={stat.metric} label={stat.label} value={stat.value.toLocaleString('en')} />
        ))}
      </MetricGrid>

      <Panel>
        <SectionHeader title="Businesses by industry" />
        {vm.byIndustry.map((stat) => (
          <Row key={stat.metric}>
            <Text variant="bodyMedium" style={styles.grow}>
              {stat.label}
            </Text>
            <Text variant="titleSmall">{stat.value}</Text>
          </Row>
        ))}
      </Panel>

      <Panel>
        <SectionHeader title="Recent errors" />
        {vm.events.length === 0 ? <EmptyState illustration="done" title="No errors reported." /> : null}
        {vm.events.map((event, index) => (
          <View key={event.id} style={styles.event}>
            {index > 0 ? <Divider /> : null}
            <Row>
              <Text variant="titleSmall" style={styles.grow}>
                {event.source}
              </Text>
              <StatusPill label={event.severity} tone={SEVERITY_TONE[event.severity]} />
            </Row>
            <Text variant="bodySmall">{event.message}</Text>
            <Text style={styles.muted}>{when(event.createdAt)}</Text>
          </View>
        ))}
      </Panel>
    </Screen>
  );
}

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'INSERT', label: 'Added' },
  { value: 'UPDATE', label: 'Changed' },
  { value: 'DELETE', label: 'Removed' },
];

export function AuditScreen() {
  const vm = useAuditViewModel();

  return (
    <Screen>
      <SectionHeader title="Audit log" description="Read only. It records changes to business records and platform settings." />
      <FormField label="Table name" value={vm.table} onChangeText={vm.setTable} autoCapitalize="none" placeholder="e.g. sales_transactions" />
      <Row gap={spacing.sm}>
        <View style={styles.grow}>
          <SelectField label="Action" value={vm.action} options={ACTION_OPTIONS} onChange={vm.setAction} />
        </View>
        <View style={styles.grow}>
          <SelectField label="Date" value={vm.dateRange} options={DATE_RANGE_OPTIONS} onChange={vm.setDateRange} />
        </View>
      </Row>
      {vm.loading ? (
        <LoadingView />
      ) : vm.error ? (
        <ErrorView message={vm.error} onRetry={vm.retry} />
      ) : vm.items.length === 0 ? (
        <EmptyState illustration="ledger" title="No matching changes." />
      ) : (
        <Panel style={styles.list}>
          {vm.items.map((entry, index) => (
            <View key={entry.id}>
              {index > 0 ? <Divider /> : null}
              <List.Item
                title={`${entry.action} ${entry.tableSchema}.${entry.tableName}`}
                description={`${when(entry.occurredAt)} · ${entry.actorEmail ?? 'System'}${entry.action === 'UPDATE' && entry.changedFields.length ? `\nChanged: ${entry.changedFields.join(', ')}` : ''}`}
                descriptionNumberOfLines={3}
              />
            </View>
          ))}
        </Panel>
      )}
    </Screen>
  );
}

const OUTCOME_OPTIONS = [
  { value: '', label: 'All outcomes' },
  { value: 'answered', label: 'Answered' },
  { value: 'insufficient_data', label: 'Not enough data' },
  { value: 'failed', label: 'Failed' },
];

export function AiLogsScreen() {
  const vm = useAiLogsViewModel();

  return (
    <Screen>
      <SectionHeader title="AI usage" description="Request details only. What people asked stays private to them." />
      <Row gap={spacing.sm}>
        <View style={styles.grow}>
          <SelectField label="Outcome" value={vm.outcome} options={OUTCOME_OPTIONS} onChange={vm.setOutcome} />
        </View>
        <View style={styles.grow}>
          <SelectField label="Date" value={vm.dateRange} options={DATE_RANGE_OPTIONS} onChange={vm.setDateRange} />
        </View>
      </Row>
      {vm.usage ? (
        <MetricGrid>
          <MetricCard label="Requests" value={String(vm.usage.requests)} caption={`${vm.usage.fromAi} AI, ${vm.usage.fromRules} rules`} />
          <MetricCard label="Failed" value={String(vm.usage.failed)} caption={`${vm.usage.insufficientData} lacked data`} />
          <MetricCard label="Average response" value={vm.usage.averageLatencyMs === null ? '—' : `${vm.usage.averageLatencyMs} ms`} />
        </MetricGrid>
      ) : null}
      {vm.loading ? (
        <LoadingView />
      ) : vm.error ? (
        <ErrorView message={vm.error} onRetry={vm.retry} />
      ) : vm.items.length === 0 ? (
        <EmptyState illustration="chat" title="No requests in this period." />
      ) : (
        <Panel style={styles.list}>
          {vm.items.map((request, index) => (
            <View key={request.id}>
              {index > 0 ? <Divider /> : null}
              <List.Item
                title={request.intent}
                description={`${when(request.createdAt)} · ${request.source}${request.latencyMs === null ? '' : ` · ${request.latencyMs} ms`}\n${request.userEmail ?? 'Removed user'} · ${request.businessName ?? 'No business'}`}
                descriptionNumberOfLines={2}
                right={() => <StatusPill label={request.outcome.replace(/_/g, ' ')} tone={request.outcome === 'failed' ? 'danger' : request.outcome === 'answered' ? 'ok' : 'warn'} />}
              />
            </View>
          ))}
        </Panel>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing.xs, gap: 0 },
  grow: { flex: 1, minWidth: 0 },
  muted: { fontSize: 11, color: supporting.mutedText },
  toggle: { alignItems: 'center', gap: 2 },
  permission: { gap: spacing.xs, paddingVertical: spacing.xs },
  permissionLabel: { fontWeight: '600' },
  event: { gap: spacing.xs },
});
