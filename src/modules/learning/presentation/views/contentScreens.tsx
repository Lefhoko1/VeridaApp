import { View } from 'react-native';
import { Divider, List, Searchbar, Text } from 'react-native-paper';

import { DetailPanel, ProfileHeader, Button, EmptyState, ErrorView, FormField, LoadingView, Panel, Row, Screen, SectionHeader, SelectField, StatusPill, spacing, supporting } from '@/design-system';

import { CONTENT_STATUS_OPTIONS, DIFFICULTY_OPTIONS } from '../../domain/validation';
import { useAssignLessonViewModel, useContentDetailViewModel, useContentFormViewModel, useContentListViewModel } from '../viewmodels/useContentViewModels';

const STATUS_TONE = { draft: 'warn', approved: 'ok', archived: 'neutral' } as const;
const STATUS_FILTER = [{ value: '', label: 'All statuses' }, ...CONTENT_STATUS_OPTIONS];
const TEXT_LINES = 6;

export function ContentListScreen({ onCreate, onOpen }: { onCreate: () => void; onOpen: (id: string) => void }) {
  const vm = useContentListViewModel();

  return (
    <Screen>
      <SectionHeader title="Learning content" description="Approved content is what lessons are built from." />
      <Button mode="contained" icon="plus" onPress={onCreate}>
        Add learning content
      </Button>
      <Searchbar placeholder="Search by title" value={vm.search} onChangeText={vm.setSearch} style={{ backgroundColor: supporting.white, borderWidth: 1, borderColor: supporting.line }} />
      <SelectField label="Status" value={vm.status} options={STATUS_FILTER} onChange={vm.setStatus} />
      {vm.loading ? (
        <LoadingView />
      ) : vm.error ? (
        <ErrorView message={vm.error} onRetry={vm.retry} />
      ) : vm.items.length === 0 ? (
        <EmptyState illustration="book" title="No content matches." />
      ) : (
        <Panel style={{ padding: spacing.xs, gap: 0 }}>
          {vm.items.map((item, index) => (
            <View key={item.id}>
              {index > 0 ? <Divider /> : null}
              <List.Item
                title={item.title}
                description={`${item.topic} · ${item.difficulty} · version ${item.version}`}
                onPress={() => onOpen(item.id)}
                right={() => <StatusPill label={item.approvalStatus} tone={STATUS_TONE[item.approvalStatus]} />}
              />
            </View>
          ))}
        </Panel>
      )}
    </Screen>
  );
}

function AssignLessonPanel({ contentId }: { contentId: string }) {
  const vm = useAssignLessonViewModel(contentId);

  return (
    <Panel>
      <SectionHeader title="Assign to a learner" description="Creates a lesson from this content. A reviewer still approves it before the learner sees it." />
      <FormField label="Learner's email address" value={vm.email} onChangeText={vm.setEmail} error={vm.emailError} autoCapitalize="none" keyboardType="email-address" />
      <Button mode="outlined" onPress={vm.search} disabled={vm.busy}>
        Find learner
      </Button>
      {vm.searched && vm.workspaces.length === 0 ? <EmptyState illustration="search" title="No active learner with a business uses this email address." /> : null}
      {vm.workspaces.map((workspace) => (
        <Row key={workspace.businessId}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodyMedium">{workspace.fullName}</Text>
            <Text variant="bodySmall" style={{ color: supporting.mutedText }}>
              {workspace.businessName}
            </Text>
          </View>
          <Button compact onPress={() => vm.assign(workspace)} disabled={vm.busy}>
            Assign
          </Button>
        </Row>
      ))}
    </Panel>
  );
}

export function ContentFormScreen({ contentId, onDone }: { contentId?: string; onDone: () => void }) {
  const vm = useContentFormViewModel({ contentId, onDone });

  if (vm.loading) return <LoadingView />;
  if (vm.loadError) return <ErrorView message={vm.loadError} />;
  const { values, errors, setValue } = vm.form;

  return (
    <Screen>
      <Panel>
        <SectionHeader title="Categories" description={vm.version ? `Version ${vm.version}. Editing the lesson text creates a new version.` : undefined} />
        <SelectField label="Industry" value={values.industryCode} options={vm.industryOptions} onChange={(v) => setValue('industryCode', v)} />
        <FormField label="Topic" value={values.topic} onChangeText={(v) => setValue('topic', v)} error={errors.topic} />
        <SelectField label="Difficulty" value={values.difficulty} options={DIFFICULTY_OPTIONS} onChange={(v) => setValue('difficulty', v)} error={errors.difficulty} />
        <SelectField label="Linked measure (KPI)" value={values.kpiCode} options={vm.kpiOptions} onChange={(v) => setValue('kpiCode', v)} />
        <FormField label="Learning objective" value={values.objective} onChangeText={(v) => setValue('objective', v)} error={errors.objective} multiline />
        <SelectField label="Approval status" value={values.approvalStatus} options={CONTENT_STATUS_OPTIONS} onChange={(v) => setValue('approvalStatus', v)} error={errors.approvalStatus} />
      </Panel>
      <Panel>
        <SectionHeader title="Lesson text" />
        <FormField label="Title" value={values.title} onChangeText={(v) => setValue('title', v)} error={errors.title} />
        <FormField label="Introduction" value={values.intro} onChangeText={(v) => setValue('intro', v)} error={errors.intro} multiline numberOfLines={TEXT_LINES} />
        <FormField label="Example" value={values.example} onChangeText={(v) => setValue('example', v)} error={errors.example} multiline numberOfLines={TEXT_LINES} />
        <FormField label="Practical activity" value={values.challenge} onChangeText={(v) => setValue('challenge', v)} error={errors.challenge} multiline numberOfLines={TEXT_LINES} />
        <FormField label="Further activities, one per line (optional)" value={values.activities} onChangeText={(v) => setValue('activities', v)} error={errors.activities} multiline numberOfLines={TEXT_LINES} />
      </Panel>
      <Button mode="contained" onPress={vm.submit} loading={vm.busy} disabled={vm.busy}>
        Save
      </Button>
    </Screen>
  );
}

export function ContentProfileScreen({ contentId, onEdit }: { contentId: string; onEdit: () => void }) {
  const vm = useContentDetailViewModel(contentId);

  if (vm.loading) return <LoadingView />;
  if (vm.error || !vm.item) return <ErrorView message={vm.error ?? 'This content could not be found.'} />;
  const { item } = vm;

  return (
    <Screen>
      <ProfileHeader icon="book-open-outline" title={item.title} subtitle={`${item.topic} · version ${item.version}`} status={{ label: item.approvalStatus, tone: STATUS_TONE[item.approvalStatus] }} />
      <DetailPanel
        rows={[
          { label: 'Industry', value: vm.industryName, half: true },
          { label: 'Difficulty', value: item.difficulty, half: true },
          { label: 'Linked measure (KPI)', value: vm.kpiName },
          { label: 'Learning objective', value: item.objective },
        ]}
      />
      <DetailPanel
        title="Lesson text"
        rows={[
          { label: 'Introduction', value: item.intro },
          { label: 'Example', value: item.example },
          { label: 'Practical activity', value: item.challenge },
          { label: 'Further activities', value: item.activities.join('\n') },
        ]}
      />
      <Button mode="contained" icon="pencil-outline" onPress={onEdit}>
        Edit content
      </Button>
      {vm.canArchive ? (
        <Button onPress={vm.archive} disabled={vm.archiving}>
          Archive
        </Button>
      ) : null}
      {vm.canAssign ? <AssignLessonPanel contentId={contentId} /> : null}
    </Screen>
  );
}
