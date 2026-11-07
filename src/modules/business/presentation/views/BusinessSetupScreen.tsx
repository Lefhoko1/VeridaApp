import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { MultiSelectField, Illustration, Button, ChoiceCard, FormField, Kicker, LoadingView, Notice, Panel, Screen, SelectField, StepDots, Row, spacing, supporting, SceneHeader, Reveal, palette, type IllustrationName } from '@/design-system';

import { useAccountAccess, useCurrentUser, useEntryChoice } from '@/modules/account';

import type { Workspace } from '../../domain/models';
import { BUSINESS_GOALS, BUSINESS_SIZES, BUSINESS_STAGES, RECORD_KEEPING_OPTIONS } from '../../domain/validation';
import { useReceivedInvitationsViewModel } from '../viewmodels/useMembersViewModel';
import { SETUP_STEPS, useBusinessSetupViewModel } from '../viewmodels/useBusinessSetupViewModel';

const asOptions = (values: string[]) => values.map((value) => ({ value, label: value }));

// Industries are data, so one added later simply takes the general picture.
const INDUSTRY_ART: Record<string, IllustrationName> = { poultry: 'poultry', retail: 'retail', salon: 'salon', food: 'food', professional: 'professional' };

export function BusinessSetupScreen({ existing, onDone }: { existing?: Workspace; onDone?: () => void }) {
  const { choice } = useEntryChoice();
  // Only someone with no business yet, who registered to join one, starts by waiting for an invitation.
  if (choice === 'join_business' && !existing && !onDone) return <JoinBusinessScreen />;
  return <BusinessSetupForm existing={existing} onDone={onDone} />;
}

function JoinBusinessScreen() {
  const vm = useReceivedInvitationsViewModel();
  const { setChoice } = useEntryChoice();
  const { signOut, signingOut } = useAccountAccess();
  const { email } = useCurrentUser();

  if (vm.loading) return <LoadingView />;

  return (
    <Screen hero={<SceneHeader />}>
      <View style={styles.intro}>
        <Kicker>Joining a business</Kicker>
        <Text variant="headlineSmall" style={styles.title} accessibilityRole="header">
          {vm.invitations.length > 0 ? 'Your invitation is ready.' : 'Waiting for your invitation.'}
        </Text>
        {vm.invitations.length === 0 ? (
          <Text variant="bodyMedium" style={styles.muted}>
            Ask the business owner to invite {email}. The invitation will appear here.
          </Text>
        ) : null}
      </View>
      {vm.invitations.length > 0 ? (
        <PendingInvitations />
      ) : (
        <>
          <View style={styles.picture}>
            <Illustration name="people" size={112} />
          </View>
          <Button mode="contained" onPress={vm.check} loading={vm.checking} disabled={vm.checking}>
            Check again
          </Button>
        </>
      )}
      <Button mode="outlined" onPress={() => setChoice('own_business')}>
        Set up my own business instead
      </Button>
      <Button onPress={signOut} loading={signingOut} disabled={signingOut}>
        Sign out
      </Button>
    </Screen>
  );
}

function BusinessSetupForm({ existing, onDone }: { existing?: Workspace; onDone?: () => void }) {
  const vm = useBusinessSetupViewModel({ existing, onDone });
  const { values, errors, setValue } = vm.form;

  if (vm.loadingIndustries) return <LoadingView />;

  return (
    <Screen hero={!vm.isEditing && !onDone ? <SceneHeader /> : undefined}>
      {!vm.isEditing ? <PendingInvitations /> : null}
      <View style={styles.intro}>
        <Kicker>A better understanding starts here</Kicker>
        <Text variant="headlineSmall" style={styles.title} accessibilityRole="header">
          {vm.isEditing ? 'Update your business.' : "Let's set up your business."}
        </Text>
        <Text variant="bodySmall" style={styles.muted}>
          This short setup helps Verida personalise your workspace.
        </Text>
      </View>
      <StepDots total={SETUP_STEPS} current={vm.step} />

      {vm.step === 0 ? (
        <Reveal style={styles.section}>
          <Text variant="titleMedium">What type of business do you run?</Text>
          <Text variant="bodySmall" style={styles.muted}>
            Choose as many as apply. The first one you choose sets the dashboard&apos;s main figures.
          </Text>
          <Button mode={vm.allIndustriesSelected ? 'contained-tonal' : 'outlined'} icon={vm.allIndustriesSelected ? 'check' : undefined} onPress={vm.toggleAllIndustries}>
            All of the above
          </Button>
          <View style={styles.choices}>
            {vm.industries.map((industry) => (
              <ChoiceCard
                key={industry.code}
                title={industry.name}
                description={industry.description}
                illustration={INDUSTRY_ART[industry.code] ?? 'other'}
                selected={vm.selectedIndustries.includes(industry.code)}
                multiple
                onPress={() => vm.toggleIndustry(industry.code)}
              />
            ))}
          </View>
          {vm.otherTypeSelected ? <FormField label="What kind of business is it?" value={values.otherType} onChangeText={(v) => setValue('otherType', v)} error={errors.otherType} /> : null}
          {vm.industryError ? <Notice>{vm.industryError}</Notice> : null}
          {vm.isEditing ? <Notice tone="info">You can add types at any time. A type can only be removed while it has no activity records.</Notice> : null}
        </Reveal>
      ) : null}

      {vm.step === 1 ? (
        <Reveal style={styles.section}>
          <Text variant="titleMedium">Tell us a little about your business.</Text>
          <FormField label="Business name" value={values.name} onChangeText={(v) => setValue('name', v)} error={errors.name} />
          <SelectField label="Business stage" value={values.stage} options={asOptions(BUSINESS_STAGES)} onChange={(v) => setValue('stage', v)} error={errors.stage} allowOther />
          <SelectField label="Business size" value={values.size} options={asOptions(BUSINESS_SIZES)} onChange={(v) => setValue('size', v)} error={errors.size} />
          <SelectField label="Country" value={values.country} options={vm.countryOptions} onChange={vm.selectCountry} error={errors.country} />
          <FormField label="Town or city (optional)" value={values.location} onChangeText={(v) => setValue('location', v)} error={errors.location} />
          <SelectField label="Currency" value={values.currency} options={vm.currencyOptions} onChange={vm.selectCurrency} error={errors.currency} hint={vm.currencyHint} />
        </Reveal>
      ) : null}

      {vm.step === 2 ? (
        <Reveal style={styles.section}>
          <Text variant="titleMedium">What would you like help with?</Text>
          <MultiSelectField label="Reasons for using Verida" values={vm.goals} options={asOptions(BUSINESS_GOALS)} onChange={vm.setGoals} error={errors.mainGoal} />
          <MultiSelectField label="How do you keep business information?" values={vm.recordKeepingChoices} options={asOptions(RECORD_KEEPING_OPTIONS)} onChange={vm.setRecordKeepingChoices} error={errors.recordKeeping} />
          <Text variant="bodySmall" style={styles.muted}>
            No formal records? That&apos;s okay. Verida will help you start.
          </Text>
        </Reveal>
      ) : null}

      <View style={styles.actions}>
        <Button mode="outlined" onPress={vm.back} disabled={vm.step === 0 || vm.saving}>
          Back
        </Button>
        <Button mode="contained" onPress={vm.next} loading={vm.saving} disabled={vm.saving}>
          {!vm.isLastStep ? 'Continue' : vm.isEditing ? 'Save changes' : 'Create my workspace'}
        </Button>
      </View>
    </Screen>
  );
}

function PendingInvitations() {
  const vm = useReceivedInvitationsViewModel();
  if (vm.invitations.length === 0) return null;
  return (
    <>
      {vm.invitations.map((invitation) => (
        <Panel key={invitation.id} tone="mint">
          <Text variant="titleSmall">You have been invited to {invitation.businessName}</Text>
          <Text variant="bodySmall" style={styles.muted}>
            Join as {invitation.role}, instead of creating your own business.
          </Text>
          <Row>
            <Button mode="contained" onPress={() => vm.accept(invitation.id)} disabled={vm.busy}>
              Accept
            </Button>
            <Button onPress={() => vm.decline(invitation.id)} disabled={vm.busy}>
              Decline
            </Button>
          </Row>
        </Panel>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.xs },
  picture: { alignItems: 'center' },
  title: { color: palette.deepTeal },
  muted: { color: supporting.mutedText },
  section: { gap: spacing.md },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  actions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.sm },
});
