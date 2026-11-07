import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { todayIso } from '@/core/format/format';
import { businessScope } from '@/core/query/queryClient';
import { rangeStart, type DateRangeKey } from '@/core/time/dateRange';

import type { CategoryKind, RecordFilter } from '../../domain/models';
import { useRecordsDependencies } from '../di';

// FR-C04, FR-C05: the search and filter state shared by the sales and expense lists.
export function useRecordFilters(businessId: string, kind: CategoryKind) {
  const { categories } = useRecordsDependencies();
  const [search, setSearch] = useState('');
  const [categoryChoices, setCategories] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<DateRangeKey>('all');

  const options = useQuery({
    queryKey: [...businessScope(businessId), 'categories', kind],
    queryFn: () => categories.list(businessId, kind),
  });

  const filter = useMemo<RecordFilter>(
    () => ({ search, categories: categoryChoices.length > 0 ? categoryChoices : undefined, from: rangeStart(dateRange, todayIso()) }),
    [search, categoryChoices, dateRange],
  );

  return {
    filter,
    isFiltered: search !== '' || categoryChoices.length > 0 || dateRange !== 'all',
    search,
    setSearch,
    categories: categoryChoices,
    setCategories,
    categoryOptions: (options.data ?? []).map((value) => ({ value, label: value })),
    dateRange,
    setDateRange: (value: string) => setDateRange(value as DateRangeKey),
  };
}
