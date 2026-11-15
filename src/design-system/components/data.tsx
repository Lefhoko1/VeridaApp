import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

import { palette, supporting } from '../theme/palette';
import { radius, shadows, spacing } from '../theme/theme';
import { GrowBar, GrowColumn, motion, PressableScale, Reveal } from './motion';
import { IconTile, type TileTone } from './art';
import { Panel } from './layout';
import { useWideLayout } from './responsive';
import { StatusPill, type StatusTone } from './status';

type MetricCardProps = {
  label: string;
  value: string;
  caption?: string;
  status?: { label: string; tone: StatusTone };
  onPress?: () => void;
  // Position in its grid, so that a row of cards arrives one after another.
  index?: number;
};

export function MetricCard({ label, value, caption, status, onPress, index = 0 }: MetricCardProps) {
  const wide = useWideLayout();
  return (
    <Reveal index={index} style={[styles.metricSlot, wide && styles.metricSlotWide]}>
      <PressableScale onPress={onPress} disabled={!onPress} style={styles.metric} accessibilityRole={onPress ? 'button' : undefined}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {caption ? <Text style={styles.metricCaption}>{caption}</Text> : null}
        {status ? <StatusPill label={status.label} tone={status.tone} /> : null}
      </PressableScale>
    </Reveal>
  );
}

export function MetricGrid({ children }: { children: React.ReactNode }) {
  return <View style={styles.grid}>{children}</View>;
}

export function BarRow({ label, ratio, value, tone = 'teal', delay = 0 }: { label: string; ratio: number; value: string; tone?: 'teal' | 'coral'; delay?: number }) {
  return (
    <View style={styles.barRow} accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.barLabel}>{label}</Text>
      <GrowBar ratio={ratio} tone={tone} delay={delay} />
      <Text style={styles.barValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

export type GroupedBar = { key: string; label: string; primary: number; secondary: number };

const CHART_HEIGHT = 120;
// Faint guide lines behind the bars, as in the updated design. LABEL_SPACE is the period label's row under the bars.
const GRID_LINES = [1, 2, 3, 4];
const LABEL_SPACE = 19;

// Revenue against expenses by period, as in the prototype's monthly pattern chart.
export function GroupedBarChart({ data, primaryLabel, secondaryLabel }: { data: GroupedBar[]; primaryLabel: string; secondaryLabel: string }) {
  const max = Math.max(1, ...data.flatMap((item) => [item.primary, item.secondary]));
  const heightOf = (value: number) => (value <= 0 ? 0 : Math.max(2, (value / max) * CHART_HEIGHT));
  return (
    <View accessibilityRole="image" accessibilityLabel={data.map((d) => `${d.label}: ${primaryLabel} ${d.primary}, ${secondaryLabel} ${d.secondary}`).join('. ')}>
      <View style={styles.chart}>
        {GRID_LINES.map((step) => (
          <View key={step} style={[styles.gridLine, { bottom: LABEL_SPACE + (CHART_HEIGHT * step) / GRID_LINES.length }]} />
        ))}
        {data.map((item, index) => (
          <View key={item.key} style={styles.chartGroup}>
            <View style={styles.chartBars}>
              <GrowColumn height={heightOf(item.primary)} color={palette.teal} delay={index * motion.stagger} />
              <GrowColumn height={heightOf(item.secondary)} color={palette.mutedCoral} delay={index * motion.stagger} />
            </View>
            <Text style={styles.chartLabel}>{item.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.legend}>
        <LegendDot color={palette.teal} label={primaryLabel} />
        <LegendDot color={palette.mutedCoral} label={secondaryLabel} />
      </View>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.metricCaption}>{label}</Text>
    </View>
  );
}

// half lays pairs out side by side inside a wrapping row.
export function LabelValue({ label, value, half = false }: { label: string; value: string; half?: boolean }) {
  return (
    <View style={[styles.labelValue, half && styles.labelValueHalf]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text variant="bodyMedium" style={styles.valueText}>
        {value}
      </Text>
    </View>
  );
}

type ProfileHeaderProps = {
  icon: string;
  tone?: TileTone;
  title: string;
  subtitle?: string;
  // The figure this record is about, such as a sale's total.
  value?: string;
  status?: { label: string; tone: StatusTone };
  struckThrough?: boolean;
};

// The top of a profile page: what this is, its main figure and its state.
export function ProfileHeader({ icon, tone, title, subtitle, value, status, struckThrough }: ProfileHeaderProps) {
  return (
    <Panel>
      <View style={styles.profileTop}>
        <IconTile icon={icon} tone={tone} size={48} />
        <View style={styles.profileText}>
          <Text variant="titleLarge" style={styles.profileTitle} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? <Text style={styles.metricCaption}>{subtitle}</Text> : null}
        </View>
        {status ? <StatusPill label={status.label} tone={status.tone} /> : null}
      </View>
      {value ? (
        <Text style={[styles.profileValue, struckThrough && styles.struck]} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
      ) : null}
    </Panel>
  );
}

type DetailRow = { label: string; value: string | null | undefined; half?: boolean };

// A profile's facts. A blank optional detail is left out rather than shown empty.
export function DetailPanel({ title, rows }: { title?: string; rows: DetailRow[] }) {
  const shown = rows.filter((row) => row.value);
  if (shown.length === 0) return null;
  return (
    <Panel>
      {title ? (
        <Text variant="titleMedium" style={styles.profileTitle} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      <View style={styles.detailRows}>
        {shown.map((row) => (
          <LabelValue key={row.label} label={row.label} value={row.value ?? ''} half={row.half} />
        ))}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  profileText: { flex: 1, gap: 2 },
  profileTitle: { color: palette.deepTeal },
  profileValue: { color: palette.deepTeal, fontSize: 32, lineHeight: 40, fontWeight: '800', letterSpacing: -1 },
  struck: { textDecorationLine: 'line-through', color: supporting.mutedText },
  detailRows: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  metricSlot: { flexGrow: 1, flexBasis: '45%', minWidth: 140 },
  // Four to a row on a wide window, as in the prototype.
  metricSlotWide: { flexBasis: '22%' },
  metric: {
    flexGrow: 1,
    backgroundColor: supporting.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: supporting.line,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
    ...shadows.soft,
  },
  metricLabel: { color: supporting.mutedText, fontSize: 12, fontWeight: '600' },
  metricValue: { color: palette.deepTeal, fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.8 },
  metricCaption: { color: supporting.mutedText, fontSize: 11, lineHeight: 15 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barLabel: { width: 72, fontSize: 12, color: supporting.ink },
  barValue: { width: 88, textAlign: 'right', fontSize: 12, fontWeight: '700', color: palette.deepTeal },
  chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', gap: spacing.xs, paddingTop: spacing.sm },
  chartGroup: { alignItems: 'center', gap: spacing.xs, flex: 1 },
  chartBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: CHART_HEIGHT, borderBottomWidth: 1, borderBottomColor: '#CDDFD4', alignSelf: 'stretch', justifyContent: 'center' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: '#E5EEE8' },
  chartLabel: { fontSize: 11, color: supporting.mutedText },
  legend: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  labelValue: { gap: 2, width: '100%' },
  labelValueHalf: { width: 'auto', flexBasis: '45%', flexGrow: 1 },
  valueText: { fontWeight: '600', color: supporting.ink },
});
