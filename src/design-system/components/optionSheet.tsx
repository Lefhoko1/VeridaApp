import { useMemo, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Icon, IconButton, Searchbar, Text, TextInput, TouchableRipple } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, supporting } from '../theme/palette';
import { radius, shadows, spacing } from '../theme/theme';
import { Button } from './button';
import { useWideLayout } from './responsive';
import { matchesSearch, toggleAll, toggleOption, type SelectOption } from './optionSelection';

const SEARCH_FROM = 9;

type OptionSheetProps = {
  visible: boolean;
  title: string;
  options: SelectOption[];
  selected: string[];
  multiple?: boolean;
  allowOther?: boolean;
  // Offered above the options when choosing several, for example "All of the above".
  allLabel?: string;
  onConfirm: (values: string[]) => void;
  onDismiss: () => void;
};

const SHEET_SHARE_OF_SCREEN = 0.86;

// One picker for every dropdown: a bottom sheet that stays above the keyboard while searching.
// This is React Native's own Modal on purpose. Paper's Modal gives its content no height on a
// phone, though it does in a browser, so a sheet inside it draws nothing but the dimmed backdrop.
export function OptionSheet({ visible, title, options, selected, multiple = false, allowOther = false, allLabel, onConfirm, onDismiss }: OptionSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      {/* Mounted only while open, so that each opening starts from the saved values. */}
      {visible ? (
        <SheetBody title={title} options={options} selected={selected} multiple={multiple} allowOther={allowOther} allLabel={allLabel} onConfirm={onConfirm} onDismiss={onDismiss} />
      ) : null}
    </Modal>
  );
}

function SheetBody({ title, options, selected, multiple, allowOther, allLabel, onConfirm, onDismiss }: Omit<OptionSheetProps, 'visible'>) {
  const known = useMemo(() => new Set(options.map((option) => option.value)), [options]);
  const savedOther = selected.filter((value) => value !== '' && !known.has(value)).join(', ');
  const [draft, setDraft] = useState(() => selected.filter((value) => known.has(value)));
  const [search, setSearch] = useState('');
  const [otherOn, setOtherOn] = useState(savedOther !== '');
  const { height } = useWindowDimensions();
  const { top, bottom } = useSafeAreaInsets();
  const [other, setOther] = useState(savedOther);
  // On the website the picker is a dialog in the middle of the window, not a sheet from the bottom.
  const wide = useWideLayout();

  const visibleOptions = useMemo(() => options.filter((option) => matchesSearch(option, search)), [options, search]);
  const needsConfirm = Boolean(multiple) || otherOn;
  const allOn = options.length > 0 && options.every((option) => draft.includes(option.value));

  const confirm = () => {
    const typed = otherOn ? other.trim() : '';
    onConfirm(typed ? [...draft, typed] : draft);
  };

  const press = (value: string) => {
    if (multiple) {
      setDraft((current) => toggleOption(current, value));
    } else {
      onConfirm([value]);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.avoider, wide && styles.avoiderWide]}>
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Close the list" />
      <View style={wide ? [styles.sheet, styles.dialog, { maxHeight: height * 0.7 }] : [styles.sheet, { maxHeight: Math.min(height * SHEET_SHARE_OF_SCREEN, height - top), paddingBottom: spacing.lg + bottom }]}>
        <View style={styles.header}>
          <Text variant="titleMedium" style={styles.title} accessibilityRole="header">
            {title}
          </Text>
          <IconButton icon="close" size={20} onPress={onDismiss} accessibilityLabel="Close" />
        </View>
        {options.length >= SEARCH_FROM ? <Searchbar placeholder="Search" value={search} onChangeText={setSearch} style={styles.search} inputStyle={styles.searchInput} /> : null}
        <FlatList
          style={styles.list}
          data={visibleOptions}
          keyExtractor={(option) => option.value}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={20}
          ListHeaderComponent={
            multiple && allLabel && search === '' ? (
              <OptionRow label={allLabel} checked={allOn} multiple onPress={() => setDraft(toggleAll(draft, options))} />
            ) : undefined
          }
          ListEmptyComponent={<Text style={styles.empty}>Nothing matches your search.</Text>}
          renderItem={({ item }) => <OptionRow label={item.label} checked={draft.includes(item.value)} multiple={multiple} onPress={() => press(item.value)} />}
          ListFooterComponent={
            allowOther ? (
              <View>
                <OptionRow
                  label="Other"
                  checked={otherOn}
                  multiple={multiple}
                  onPress={() => {
                    setOtherOn(!otherOn || !multiple);
                    if (!multiple) setDraft([]);
                  }}
                />
                {otherOn ? (
                  <TextInput
                    mode="outlined"
                    dense
                    autoFocus
                    label="Please specify"
                    accessibilityLabel="Please specify"
                    value={other}
                    onChangeText={setOther}
                    outlineColor={supporting.mintBorder}
                    outlineStyle={styles.otherOutline}
                    style={styles.other}
                    onSubmitEditing={confirm}
                  />
                ) : null}
              </View>
            ) : undefined
          }
        />
        {needsConfirm ? (
          <View style={styles.footer}>
            <Button mode="contained" onPress={confirm}>
              Done
            </Button>
          </View>
        ) : null}
      </View>
    </KeyboardAvoidingView>
  );
}

function OptionRow({ label, checked, multiple, onPress }: { label: string; checked: boolean; multiple?: boolean; onPress: () => void }) {
  const icon = multiple ? (checked ? 'checkbox-marked' : 'checkbox-blank-outline') : checked ? 'radiobox-marked' : 'radiobox-blank';
  return (
    <TouchableRipple onPress={onPress} accessibilityRole={multiple ? 'checkbox' : 'radio'} accessibilityState={{ checked }} accessibilityLabel={label}>
      <View style={styles.row}>
        <Icon source={icon} size={22} color={checked ? palette.teal : supporting.mutedText} />
        <Text variant="bodyMedium" style={styles.rowLabel}>
          {label}
        </Text>
      </View>
    </TouchableRipple>
  );
}

const styles = StyleSheet.create({
  avoider: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(21, 60, 70, 0.45)' },
  sheet: {
    width: '100%',
    maxWidth: 560,
    backgroundColor: supporting.white,
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: spacing.xl, paddingRight: spacing.sm, paddingTop: spacing.sm },
  title: { flex: 1, color: palette.deepTeal },
  search: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: supporting.mintWash, height: 44 },
  searchInput: { minHeight: 0 },
  list: { flexGrow: 0, flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.xl, paddingVertical: spacing.md },
  rowLabel: { flex: 1 },
  empty: { padding: spacing.xl, textAlign: 'center', color: supporting.mutedText },
  other: { marginHorizontal: spacing.xl, marginBottom: spacing.sm, backgroundColor: supporting.white },
  otherOutline: { borderRadius: radius.md },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  avoiderWide: { justifyContent: 'center' },
  dialog: { maxWidth: 440, borderRadius: radius.xl, paddingBottom: spacing.lg, ...shadows.soft },
});
