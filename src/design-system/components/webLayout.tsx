import { Children, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon, Text } from 'react-native-paper';

import { palette, supporting } from '../theme/palette';
import { radius, shadows, spacing } from '../theme/theme';
import { useWideLayout } from './responsive';

// Layouts for the website on a wide window. On a phone, and in the app, each one hands back its
// children unchanged, so the screens that use them look exactly as they did before.

// Panels side by side, each taking an equal share, or the shares given in `weights`.
export function Columns({ children, weights }: { children: ReactNode; weights?: number[] }) {
  const wide = useWideLayout();
  if (!wide) return <>{children}</>;
  const items = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.columns}>
      {items.map((child, index) => (
        <View key={index} style={[styles.column, { flex: weights?.[index] ?? 1 }]}>
          {child}
        </View>
      ))}
    </View>
  );
}

// Short form fields two to a row, as in the prototype's forms.
export function FieldGrid({ children }: { children: ReactNode }) {
  const wide = useWideLayout();
  if (!wide) return <>{children}</>;
  return (
    <View style={styles.grid}>
      {Children.toArray(children)
        .filter(Boolean)
        .map((child, index) => (
          <View key={index} style={styles.field}>
            {child}
          </View>
        ))}
    </View>
  );
}

// Cards in a grid of `columns` across.
export function CardGrid({ children, columns = 2 }: { children: ReactNode; columns?: number }) {
  const wide = useWideLayout();
  if (!wide) return <>{children}</>;
  return (
    <View style={styles.cardGrid}>
      {Children.toArray(children)
        .filter(Boolean)
        .map((child, index) => (
          <View key={index} style={[styles.card, { flexBasis: `${100 / columns - 2}%` }]}>
            {child}
          </View>
        ))}
    </View>
  );
}

export type TableColumn<T> = {
  key: string;
  title: string;
  render: (row: T) => ReactNode;
  // Share of the row's width. Numbers and amounts read best aligned to the right.
  flex?: number;
  align?: 'left' | 'right';
};

type DataTableProps<T> = {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowPress?: (row: T) => void;
  // Shown for a row, such as a voided sale, that no longer counts.
  isMuted?: (row: T) => boolean;
  rowLabel?: (row: T) => string;
};

// A table for the website, in the prototype's style: small uppercase headings, a line between rows,
// and a highlight under the pointer for rows that open.
export function DataTable<T>({ columns, rows, rowKey, onRowPress, isMuted, rowLabel }: DataTableProps<T>) {
  return (
    <View style={styles.table} role="table">
      <View style={[styles.tr, styles.thead]} role="row">
        {columns.map((column) => (
          <Text key={column.key} role="columnheader" style={[styles.th, { flex: column.flex ?? 1 }, column.align === 'right' && styles.right]}>
            {column.title.toUpperCase()}
          </Text>
        ))}
        {onRowPress ? <View style={styles.chevron} /> : null}
      </View>
      {rows.map((row) => {
        const muted = isMuted?.(row) ?? false;
        const cells = columns.map((column) => {
          const content = column.render(row);
          return (
            <View key={column.key} role="cell" style={[styles.td, { flex: column.flex ?? 1 }, column.align === 'right' && styles.tdRight]}>
              {typeof content === 'string' || typeof content === 'number' ? (
                <Text style={[styles.cellText, muted && styles.muted, column.align === 'right' && styles.right]} numberOfLines={2}>
                  {content}
                </Text>
              ) : (
                content
              )}
            </View>
          );
        });
        if (!onRowPress) {
          return (
            <View key={rowKey(row)} role="row" style={styles.tr}>
              {cells}
            </View>
          );
        }
        return (
          <Pressable
            key={rowKey(row)}
            role="row"
            accessibilityLabel={rowLabel?.(row)}
            onPress={() => onRowPress(row)}
            style={(state) => [styles.tr, (state as { hovered?: boolean }).hovered && styles.hovered]}
          >
            {cells}
            <View style={styles.chevron}>
              <Icon source="chevron-right" size={18} color={supporting.mutedText} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  column: { minWidth: 0, gap: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.lg, rowGap: spacing.md },
  field: { flexGrow: 1, flexBasis: '45%', minWidth: 220 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  card: { flexGrow: 1, minWidth: 280 },
  table: {
    backgroundColor: supporting.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: supporting.line,
    overflow: 'hidden',
    ...shadows.soft,
  },
  tr: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, borderBottomWidth: 1, borderBottomColor: supporting.line, minHeight: 52 },
  thead: { minHeight: 40, backgroundColor: supporting.mintWash },
  th: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: supporting.mutedText, paddingHorizontal: spacing.sm },
  td: { paddingHorizontal: spacing.sm, paddingVertical: spacing.md, minWidth: 0, alignItems: 'flex-start' },
  tdRight: { alignItems: 'flex-end' },
  cellText: { fontSize: 14, color: supporting.ink },
  right: { textAlign: 'right' },
  muted: { color: supporting.mutedText, textDecorationLine: 'line-through' },
  hovered: { backgroundColor: palette.warmIvory },
  chevron: { width: 24, alignItems: 'flex-end' },
});
