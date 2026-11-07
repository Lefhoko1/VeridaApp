import { StyleSheet, View } from 'react-native';
import { Switch, Text } from 'react-native-paper';

import { supporting } from '../theme/palette';
import { spacing } from '../theme/theme';
import { Button } from './button';
import { Row } from './layout';

export type PermissionRow = {
  code: string;
  description: string;
  allowed: boolean;
  // True when this person's setting differs on purpose from what their role gives them.
  isPersonal: boolean;
  roleDefault: boolean;
};

type PermissionChecklistProps = {
  items: PermissionRow[];
  disabled?: boolean;
  onChange: (code: string, allowed: boolean) => void;
  onUseRoleDefault: (code: string) => void;
};

export function PermissionChecklist({ items, disabled, onChange, onUseRoleDefault }: PermissionChecklistProps) {
  return (
    <>
      {items.map((item) => (
        <View key={item.code} style={styles.item}>
          <Row>
            <Text variant="bodyMedium" style={styles.grow}>
              {item.description}
            </Text>
            <Switch value={item.allowed} disabled={disabled} onValueChange={(on) => onChange(item.code, on)} accessibilityLabel={item.description} />
          </Row>
          {item.isPersonal ? (
            <Row>
              <Text style={[styles.note, styles.grow]}>Set for this person. Their role would {item.roleDefault ? 'allow' : 'not allow'} this.</Text>
              <Button compact disabled={disabled} onPress={() => onUseRoleDefault(item.code)}>
                Use role setting
              </Button>
            </Row>
          ) : null}
        </View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  item: { gap: spacing.xs, paddingVertical: spacing.xs },
  grow: { flex: 1, minWidth: 0 },
  note: { fontSize: 11, color: supporting.mutedText },
});
