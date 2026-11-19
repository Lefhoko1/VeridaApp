import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, supporting } from '../theme/palette';
import { radius, shadows, spacing } from '../theme/theme';
import { Button } from './button';
import { useWideLayout } from './responsive';

import { MONTHS, WEEKDAYS, isValidDate, localToday, monthCells } from './calendarDays';

type CalendarSheetProps = {
  visible: boolean;
  title: string;
  value: string;
  // Optional fields can be emptied from the calendar.
  clearable?: boolean;
  onPick: (iso: string) => void;
  onDismiss: () => void;
};

// A month calendar for choosing one day. React Native's own Modal, as in OptionSheet, so it
// draws on a phone as well as in a browser.
export function CalendarSheet({ visible, ...props }: CalendarSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={props.onDismiss}>
      {/* Mounted only while open, so each opening starts at the chosen day's month. */}
      {visible ? <CalendarBody {...props} /> : null}
    </Modal>
  );
}

function CalendarBody({ title, value, clearable, onPick, onDismiss }: Omit<CalendarSheetProps, 'visible'>) {
  const today = localToday();
  const start = isValidDate(value) ? value : today;
  const [year, setYear] = useState(Number(start.slice(0, 4)));
  const [month, setMonth] = useState(Number(start.slice(5, 7)) - 1);
  const wide = useWideLayout();
  const { bottom } = useSafeAreaInsets();

  const shift = (step: -1 | 1) => {
    const next = month + step;
    setYear((current) => current + Math.floor(next / 12));
    setMonth(((next % 12) + 12) % 12);
  };

  return (
    <View style={[styles.avoider, wide && styles.avoiderWide]}>
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close the calendar" />
      <View style={[styles.sheet, wide ? styles.dialog : { paddingBottom: spacing.lg + bottom }]}>
        <View style={styles.header}>
          <Text variant="titleMedium" style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <IconButton icon="close" size={20} onPress={onDismiss} accessibilityLabel="Close" />
        </View>
        <View style={styles.monthRow}>
          <IconButton icon="chevron-left" onPress={() => shift(-1)} accessibilityLabel="Previous month" />
          <Text variant="titleSmall" style={styles.monthName}>{`${MONTHS[month]} ${year}`}</Text>
          <IconButton icon="chevron-right" onPress={() => shift(1)} accessibilityLabel="Next month" />
        </View>
        <View style={styles.grid}>
          <View style={styles.week}>
            {WEEKDAYS.map((day) => (
              <Text key={day} style={styles.weekday}>
                {day}
              </Text>
            ))}
          </View>
          {monthCells(year, month).map((week, index) => (
            <View key={index} style={styles.week}>
              {week.map((day, slot) =>
                day ? (
                  <Pressable
                    key={day}
                    onPress={() => onPick(day)}
                    style={({ pressed }) => [styles.day, day === today && styles.today, day === value && styles.chosen, pressed && styles.pressed]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: day === value }}
                    accessibilityLabel={`${Number(day.slice(8, 10))} ${MONTHS[month]} ${year}`}
                  >
                    <Text style={day === value ? styles.chosenText : styles.dayText}>{Number(day.slice(8, 10))}</Text>
                  </Pressable>
                ) : (
                  <View key={`blank-${slot}`} style={styles.day} />
                ),
              )}
            </View>
          ))}
        </View>
        <View style={styles.footer}>
          <Button mode="outlined" compact onPress={() => onPick(today)}>
            Today
          </Button>
          {clearable && value ? (
            <Button compact onPress={() => onPick('')}>
              Clear
            </Button>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avoider: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  avoiderWide: { justifyContent: 'center' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(21, 60, 70, 0.45)' },
  sheet: { width: '100%', maxWidth: 420, backgroundColor: supporting.white, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl },
  dialog: { borderRadius: radius.xl, paddingBottom: spacing.lg, ...shadows.soft },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.xl, paddingRight: spacing.sm, paddingTop: spacing.sm },
  title: { flex: 1, color: palette.deepTeal },
  monthRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm },
  monthName: { flex: 1, textAlign: 'center', color: supporting.ink },
  grid: { paddingHorizontal: spacing.md, gap: spacing.xs },
  week: { flexDirection: 'row', gap: spacing.xs },
  weekday: { flex: 1, textAlign: 'center', fontSize: 12, color: supporting.mutedText },
  day: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
  dayText: { color: supporting.ink },
  today: { borderWidth: 1, borderColor: palette.teal },
  chosen: { backgroundColor: palette.teal },
  chosenText: { color: supporting.white, fontWeight: '600' },
  pressed: { backgroundColor: palette.softMint },
  footer: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md },
});
