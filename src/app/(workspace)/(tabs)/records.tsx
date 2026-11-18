import { router } from 'expo-router';
import { useState } from 'react';
import { SegmentedButtons } from 'react-native-paper';

import { ActivityList } from '@/modules/operations';
import { ExpenseList, SalesList } from '@/modules/records';

type RecordTab = 'sales' | 'expenses' | 'activity';

const TABS = [
  { value: 'sales', label: 'Sales' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'activity', label: 'Activity' },
];

// Records and operations are separate modules. This route is where they meet on one screen.
export default function RecordsRoute() {
  const [tab, setTab] = useState<RecordTab>('sales');
  const header = <SegmentedButtons value={tab} onValueChange={(value) => setTab(value as RecordTab)} buttons={TABS} />;

  if (tab === 'sales') {
    return <SalesList header={header} onCreate={() => router.push('/sales/new')} onImport={() => router.push('/import/sales')} onOpen={(id) => router.push({ pathname: '/sales/[id]', params: { id } })} />;
  }
  if (tab === 'expenses') {
    return <ExpenseList header={header} onCreate={() => router.push('/expenses/new')} onImport={() => router.push('/import/expenses')} onOpen={(id) => router.push({ pathname: '/expenses/[id]', params: { id } })} />;
  }
  return (
    <ActivityList
      header={header}
      onCreate={() => router.push('/activities/new')}
      onImport={() => router.push('/import/activity')}
      onOpen={(id) => router.push({ pathname: '/activities/[id]', params: { id } })}
      onOpenFlocks={() => router.push('/flocks')}
      onChooseActivities={() => router.push('/activities/settings')}
    />
  );
}
