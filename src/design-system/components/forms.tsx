import { useState, type ComponentProps } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Dialog, HelperText, Icon, Portal, TextInput, TouchableRipple, Text } from 'react-native-paper';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { palette, supporting } from '../theme/palette';
import { radius, shadows, spacing } from '../theme/theme';
import { Illustration, type IllustrationName } from './art';
import { Button } from './button';
import { GrowBar, motion } from './motion';
import type { SelectOption } from './optionSelection';
import { OptionSheet } from './optionSheet';

export type { SelectOption } from './optionSelection';

type FormFieldProps = Omit<ComponentProps<typeof TextInput>, 'error' | 'mode'> & {
  error?: string;
  hint?: string;
};

export function FormField({ error, hint, style, ...input }: FormFieldProps) {
  const helper = error ?? hint;
  // Paper draws its label as separate text, so screen readers need it set on the input itself.
  const accessibilityLabel = typeof input.label === 'string' ? input.label : undefined;
  return (
    // style sizes the field within its layout, so it belongs on the wrapper rather than the input.
    <View style={style as ViewStyle}>
      <TextInput mode="outlined" dense outlineColor={supporting.mintBorder} outlineStyle={styles.inputOutline} style={styles.input} error={Boolean(error)} accessibilityLabel={accessibilityLabel} {...input} />
      {helper ? (
        <HelperText type={error ? 'error' : 'info'} padding="none">
          {helper}
        </HelperText>
      ) : null}
    </View>
  );
}

export function PasswordField({ error, hint, ...input }: FormFieldProps) {
  const [hidden, setHidden] = useState(true);
  return (
    <FormField
      {...input}
      error={error}
      hint={hint}
      secureTextEntry={hidden}
      autoCapitalize="none"
      right={<TextInput.Icon icon={hidden ? 'eye-outline' : 'eye-off-outline'} onPress={() => setHidden(!hidden)} accessibilityLabel={hidden ? 'Show password' : 'Hide password'} />}
    />
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  // Lets someone type an answer the list doesn't have. A value outside the options still displays.
  allowOther?: boolean;
};

export function SelectField({ label, value, options, onChange, error, hint, disabled, allowOther }: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value)?.label ?? value;
  return (
    <View>
      <FieldButton label={label} text={selected} placeholder="not selected" error={error} hint={hint} disabled={disabled} onPress={() => setOpen(true)} />
      <OptionSheet
        visible={open}
        title={label}
        options={options}
        selected={[value]}
        allowOther={allowOther}
        onDismiss={() => setOpen(false)}
        onConfirm={(values) => {
          onChange(values[0] ?? '');
          setOpen(false);
        }}
      />
    </View>
  );
}

type MultiSelectFieldProps = {
  label: string;
  values: string[];
  options: SelectOption[];
  onChange: (values: string[]) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  allowOther?: boolean;
  allLabel?: string;
  // Shown when nothing is chosen, where that has a meaning of its own, such as "All categories".
  emptyText?: string;
};

export function MultiSelectField({ label, values, options, onChange, error, hint, disabled, allowOther = true, allLabel = 'All of the above', emptyText }: MultiSelectFieldProps) {
  const [open, setOpen] = useState(false);
  const labels = values.map((value) => options.find((option) => option.value === value)?.label ?? value);
  const all = labels.join(', ');
  // A long answer wouldn't fit in the field, so it reads as a count with the full list underneath.
  const isLong = labels.length > 2;
  const helper = isLong ? all : (hint ?? (emptyText ? undefined : 'Choose as many as apply.'));
  return (
    <View>
      <FieldButton label={label} text={isLong ? `${labels.length} selected` : all || (emptyText ?? '')} spoken={all} placeholder={emptyText ?? 'none selected'} error={error} hint={helper} disabled={disabled} onPress={() => setOpen(true)} />
      <OptionSheet
        visible={open}
        title={label}
        options={options}
        selected={values}
        multiple
        allowOther={allowOther}
        allLabel={allLabel}
        onDismiss={() => setOpen(false)}
        onConfirm={(next) => {
          onChange(next);
          setOpen(false);
        }}
      />
    </View>
  );
}

type FieldButtonProps = { label: string; text: string; spoken?: string; placeholder: string; error?: string; hint?: string; disabled?: boolean; onPress: () => void };

// Looks like a text field and opens a picker.
function FieldButton({ label, text, spoken, placeholder, error, hint, disabled, onPress }: FieldButtonProps) {
  return (
    <TouchableRipple onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={`${label}: ${spoken || text || placeholder}`}>
      <View pointerEvents="none">
        <FormField label={label} value={text} editable={false} error={error} hint={hint} disabled={disabled} contentStyle={styles.selectText} />
        {/* A plain icon: TextInput.Icon is itself a button, which can't sit inside this one. */}
        <View style={styles.selectIcon}>
          <Icon source="menu-down" size={24} color={supporting.mutedText} />
        </View>
      </View>
    </TouchableRipple>
  );
}

export function DateField(props: Omit<FormFieldProps, 'keyboardType' | 'placeholder'>) {
  return <FormField {...props} placeholder="YYYY-MM-DD" keyboardType="numbers-and-punctuation" hint={props.hint ?? 'Format: YYYY-MM-DD'} />;
}

type ChoiceCardProps = { title: string; description?: string; selected: boolean; onPress: () => void; illustration?: IllustrationName; multiple?: boolean };

export function ChoiceCard({ title, description, selected, onPress, illustration, multiple }: ChoiceCardProps) {
  return (
    <TouchableRipple
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
      accessibilityRole={multiple ? 'checkbox' : 'radio'}
      accessibilityState={multiple ? { checked: selected } : { selected }}
      borderless
    >
      <View style={styles.choiceBody}>
        {selected ? (
          <Animated.View entering={ZoomIn.duration(motion.fast)} style={styles.choiceCheck}>
            <Icon source="check-circle" size={22} color={palette.teal} />
          </Animated.View>
        ) : null}
        {illustration ? <Illustration name={illustration} size={64} /> : null}
        <Text variant="titleSmall" style={styles.choiceTitle}>
          {title}
        </Text>
        {description ? (
          <Text variant="bodySmall" style={styles.choiceDescription}>
            {description}
          </Text>
        ) : null}
      </View>
    </TouchableRipple>
  );
}

export function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <View style={styles.dots} accessibilityLabel={`Step ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_, index) => (
        <GrowBar key={index} ratio={index <= current ? 1 : 0} height={5} />
      ))}
    </View>
  );
}

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
  // Set to collect a required reason, for example when voiding a record.
  reason?: { label: string; value: string; onChange: (value: string) => void };
};

export function ConfirmDialog({ visible, title, message, confirmLabel, destructive, busy, onConfirm, onDismiss, reason }: ConfirmDialogProps) {
  const blocked = busy || (reason !== undefined && reason.value.trim().length === 0);
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} style={styles.dialog}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content style={styles.dialogContent}>
          <Text variant="bodyMedium">{message}</Text>
          {reason ? <FormField label={reason.label} value={reason.value} onChangeText={reason.onChange} /> : null}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>Cancel</Button>
          <Button onPress={onConfirm} disabled={blocked} loading={busy} textColor={destructive ? supporting.error : undefined}>
            {confirmLabel}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const styles = StyleSheet.create({
  input: { backgroundColor: supporting.white },
  inputOutline: { borderRadius: radius.md },
  selectIcon: { position: 'absolute', top: 14, right: spacing.sm },
  selectText: { paddingRight: spacing.xxl },
  dialog: { backgroundColor: supporting.white, maxWidth: 480, width: '90%', alignSelf: 'center' },
  dialogContent: { gap: spacing.md },
  choice: { flexGrow: 1, flexBasis: '45%', minWidth: 140, borderWidth: 1, borderColor: supporting.line, borderRadius: radius.lg, backgroundColor: supporting.white, ...shadows.soft },
  choiceSelected: { borderColor: palette.teal, backgroundColor: supporting.mintWash },
  choiceBody: { padding: spacing.md, gap: spacing.xs },
  choiceCheck: { position: 'absolute', top: spacing.sm, right: spacing.sm, zIndex: 1 },
  choiceTitle: { color: palette.deepTeal },
  choiceDescription: { color: supporting.mutedText },
  dots: { flexDirection: 'row', gap: 6 },
});
