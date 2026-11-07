import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { Button as PaperButton } from 'react-native-paper';

// Paper's button with a comfortable touch target. Compact buttons stay small, for use inside rows.
export function Button({ compact, contentStyle, ...props }: ComponentProps<typeof PaperButton>) {
  return <PaperButton compact={compact} contentStyle={[!compact && styles.tall, contentStyle]} {...props} />;
}

const styles = StyleSheet.create({
  tall: { minHeight: 46 },
});
