import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { Button as PaperButton } from 'react-native-paper';

import { useWideLayout } from './responsive';

// Paper's button with a comfortable touch target. Compact buttons stay small, for use inside rows.
// On the website a button fits its label, as buttons do on the web, rather than filling the column.
// Corners and label weight follow the updated design: 10px corners and a bold label.
export function Button({ compact, contentStyle, style, labelStyle, ...props }: ComponentProps<typeof PaperButton>) {
  const wide = useWideLayout();
  return (
    <PaperButton
      compact={compact}
      contentStyle={[!compact && (wide ? styles.wideTall : styles.tall), contentStyle]}
      style={[styles.shape, wide && styles.fit, style]}
      labelStyle={[styles.label, labelStyle]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  shape: { borderRadius: 10 },
  label: { fontWeight: '700', letterSpacing: 0 },
  tall: { minHeight: 46 },
  wideTall: { minHeight: 44, paddingHorizontal: 8 },
  fit: { alignSelf: 'flex-start' },
});
