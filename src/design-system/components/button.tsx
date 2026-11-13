import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { Button as PaperButton } from 'react-native-paper';

import { useWideLayout } from './responsive';

// Paper's button with a comfortable touch target. Compact buttons stay small, for use inside rows.
// On the website a button fits its label, as buttons do on the web, rather than filling the column.
export function Button({ compact, contentStyle, style, ...props }: ComponentProps<typeof PaperButton>) {
  const wide = useWideLayout();
  return <PaperButton compact={compact} contentStyle={[!compact && (wide ? styles.wideTall : styles.tall), contentStyle]} style={[wide && styles.fit, style]} {...props} />;
}

const styles = StyleSheet.create({
  tall: { minHeight: 46 },
  wideTall: { minHeight: 42, paddingHorizontal: 6 },
  fit: { alignSelf: 'flex-start' },
});
