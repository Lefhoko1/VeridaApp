import { View } from 'react-native';
import { HelperText } from 'react-native-paper';

import { DateField, Row, SelectField, Stack, spacing } from '@/design-system';

import { PERIOD_OPTIONS, type PeriodKey } from '../../domain/period';

type PeriodSelectorProps = {
  control: {
    periodKey: PeriodKey;
    setPeriodKey: (key: PeriodKey) => void;
    customFrom: string;
    setCustomFrom: (value: string) => void;
    customTo: string;
    setCustomTo: (value: string) => void;
    customError: string | null;
  };
};

export function PeriodSelector({ control }: PeriodSelectorProps) {
  return (
    <Stack gap={spacing.sm}>
      <SelectField label="Reporting period" value={control.periodKey} options={PERIOD_OPTIONS} onChange={(value) => control.setPeriodKey(value as PeriodKey)} />
      {control.periodKey === 'custom' ? (
        <Row gap={spacing.sm}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <DateField label="From" value={control.customFrom} onChangeText={control.setCustomFrom} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <DateField label="To" value={control.customTo} onChangeText={control.setCustomTo} />
          </View>
        </Row>
      ) : null}
      {control.customError ? <HelperText type="error">{control.customError}</HelperText> : null}
    </Stack>
  );
}
