import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { Button, Illustration, Kicker, palette, Screen, SceneHeader, spacing, supporting } from '@/design-system';

import { useTeamAccessViewModel } from '../viewmodels/usePlatformAccess';

// Choosing the Verida team opens nothing by itself: an administrator has to give the person a role.
export function TeamAccessScreen({ onUseBusiness }: { onUseBusiness: () => void }) {
  const vm = useTeamAccessViewModel();
  return (
    <Screen hero={<SceneHeader />}>
      <View style={styles.intro}>
        <Kicker>Verida team</Kicker>
        <Text variant="headlineSmall" style={styles.title} accessibilityRole="header">
          Waiting for team access.
        </Text>
        <Text variant="bodyMedium" style={styles.body}>
          A Verida administrator needs to give {vm.email} a team role under Roles and permissions.
        </Text>
      </View>
      <View style={styles.picture}>
        <Illustration name="people" size={112} />
      </View>
      <Button mode="contained" onPress={vm.check} loading={vm.checking} disabled={vm.checking}>
        Check again
      </Button>
      <Button mode="outlined" onPress={onUseBusiness}>
        Use a business workspace instead
      </Button>
      <Button onPress={vm.signOut} loading={vm.signingOut} disabled={vm.signingOut}>
        Sign out
      </Button>
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { gap: spacing.xs },
  picture: { alignItems: 'center' },
  title: { color: palette.deepTeal },
  body: { color: supporting.mutedText },
});
