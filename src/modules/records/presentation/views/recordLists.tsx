import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Divider, List, Searchbar, Text } from 'react-native-paper';

import { formatDate, formatQuantity } from '@/core/format/format';
import { MultiSelectField, Button, EmptyState, ErrorView, LoadingView, Panel, Row, Screen, SelectField, StatusPill, palette, spacing, supporting, IconTile } from '@/design-system';

import { DATE_RANGE_OPTIONS } from '@/core/time/dateRange';

import { useExpenseListViewModel } from '../viewmodels/useExpenseViewModels';
import { useProductListViewModel } from '../viewmodels/useProductViewModels';
import type { useRecordFilters } from '../viewmodels/useRecordFilters';
import { useSalesListViewModel } from '../viewmodels/useSalesViewModels';

type ListShellProps = {
  searchPlaceholder: string;
  search: string;
  onSearch: (value: string) => void;
  actions: ReactNode;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  refreshing?: boolean;
  onRefresh?: () => void;
  isEmpty: boolean;
  empty: ReactNode;
  children: ReactNode;
  header?: ReactNode;
  filters?: ReactNode;
};

function ListShell({ searchPlaceholder, search, onSearch, actions, loading, error, onRetry, refreshing, onRefresh, isEmpty, empty, children, header, filters }: ListShellProps) {
  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      {header}
      <Row wrap>{actions}</Row>
      <Searchbar placeholder={searchPlaceholder} value={search} onChangeText={onSearch} style={styles.search} inputStyle={styles.searchInput} />
      {filters}
      {loading ? <LoadingView /> : error ? <ErrorView message={error} onRetry={onRetry} /> : isEmpty ? empty : <Panel style={styles.list}>{children}</Panel>}
    </Screen>
  );
}

const voidedPill = <StatusPill label="Voided" tone="danger" />;

type FilterState = ReturnType<typeof useRecordFilters>;

function RecordFilters({ filters }: { filters: FilterState }) {
  return (
    <Row gap={spacing.sm}>
      <View style={styles.filter}>
        <MultiSelectField label="Categories" values={filters.categories} options={filters.categoryOptions} onChange={filters.setCategories} allowOther={false} allLabel="Select all" emptyText="All categories" />
      </View>
      <View style={styles.filter}>
        <SelectField label="Date" value={filters.dateRange} options={DATE_RANGE_OPTIONS} onChange={filters.setDateRange} />
      </View>
    </Row>
  );
}

type SalesListProps = { header?: ReactNode; onCreate: () => void; onImport: () => void; onOpen: (id: string) => void };

export function SalesList({ header, onCreate, onImport, onOpen }: SalesListProps) {
  const vm = useSalesListViewModel();
  return (
    <ListShell
      header={header}
      searchPlaceholder="Search sales"
      search={vm.filters.search}
      onSearch={vm.filters.setSearch}
      filters={<RecordFilters filters={vm.filters} />}
      loading={vm.loading}
      error={vm.error}
      onRetry={vm.refresh}
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      isEmpty={vm.items.length === 0}
      empty={<EmptyState illustration={vm.filters.isFiltered ? 'search' : 'ledger'} title={vm.filters.isFiltered ? 'No sales match your filters.' : 'No sales recorded yet.'} description={vm.filters.isFiltered ? undefined : 'Add your first sale to start seeing your revenue.'} />}
      actions={
        <>
          {vm.canCreate ? (
            <Button mode="contained" icon="plus" onPress={onCreate}>
              Add sale
            </Button>
          ) : null}
          <Button mode="outlined" icon="download" accessibilityLabel="Export CSV" onPress={vm.exportCsv} disabled={vm.items.length === 0}>
            Export
          </Button>
          {vm.canCreate ? (
            <Button mode="outlined" icon="upload" accessibilityLabel="Import CSV" onPress={onImport}>
              Import
            </Button>
          ) : null}
        </>
      }
    >
      {vm.items.map((sale, index) => (
        <View key={sale.id}>
          {index > 0 ? <Divider /> : null}
          <RecordRow
            title={sale.itemName}
            subtitle={`${formatDate(sale.occurredOn)} · ${formatQuantity(sale.quantity)}${sale.unit ? ` ${sale.unit}` : ''} × ${vm.money(sale.unitPrice)}`}
            amount={vm.money(sale.totalAmount)}
            voided={sale.status === 'voided'}
            onPress={() => onOpen(sale.id)}
          />
        </View>
      ))}
    </ListShell>
  );
}

type ExpenseListProps = { header?: ReactNode; onCreate: () => void; onImport: () => void; onOpen: (id: string) => void };

export function ExpenseList({ header, onCreate, onImport, onOpen }: ExpenseListProps) {
  const vm = useExpenseListViewModel();
  return (
    <ListShell
      header={header}
      searchPlaceholder="Search expenses"
      search={vm.filters.search}
      onSearch={vm.filters.setSearch}
      filters={<RecordFilters filters={vm.filters} />}
      loading={vm.loading}
      error={vm.error}
      onRetry={vm.refresh}
      refreshing={vm.refreshing}
      onRefresh={vm.refresh}
      isEmpty={vm.items.length === 0}
      empty={<EmptyState illustration={vm.filters.isFiltered ? 'search' : 'ledger'} title={vm.filters.isFiltered ? 'No expenses match your filters.' : 'No expenses recorded yet.'} description={vm.filters.isFiltered ? undefined : 'Record what you spend to see a fuller picture.'} />}
      actions={
        <>
          {vm.canCreate ? (
            <Button mode="contained" icon="plus" onPress={onCreate}>
              Add expense
            </Button>
          ) : null}
          <Button mode="outlined" icon="download" accessibilityLabel="Export CSV" onPress={vm.exportCsv} disabled={vm.items.length === 0}>
            Export
          </Button>
          {vm.canCreate ? (
            <Button mode="outlined" icon="upload" accessibilityLabel="Import CSV" onPress={onImport}>
              Import
            </Button>
          ) : null}
        </>
      }
    >
      {vm.items.map((expense, index) => (
        <View key={expense.id}>
          {index > 0 ? <Divider /> : null}
          <RecordRow
            title={expense.description}
            subtitle={`${formatDate(expense.occurredOn)} · ${expense.category}`}
            amount={vm.money(expense.amount)}
            voided={expense.status === 'voided'}
            pill={expense.certainty !== 'recorded' ? <StatusPill label={expense.certainty === 'estimated' ? 'Estimated' : 'Incomplete'} tone="warn" /> : undefined}
            onPress={() => onOpen(expense.id)}
          />
        </View>
      ))}
    </ListShell>
  );
}

function RecordRow({ title, subtitle, amount, voided, pill, onPress }: { title: string; subtitle: string; amount: string; voided: boolean; pill?: ReactNode; onPress: () => void }) {
  return (
    <List.Item
      title={title}
      description={subtitle}
      onPress={onPress}
      titleStyle={voided ? styles.voided : undefined}
      right={() => (
        <View style={styles.rowEnd}>
          <Text style={[styles.amount, voided && styles.voided]}>{amount}</Text>
          {voided ? voidedPill : pill}
        </View>
      )}
    />
  );
}

export function ProductListScreen({ onCreate, onOpen }: { onCreate: () => void; onOpen: (id: string) => void }) {
  const vm = useProductListViewModel();
  return (
    <ListShell
      searchPlaceholder="Search products and services"
      search={vm.search}
      onSearch={vm.setSearch}
      loading={vm.loading}
      error={vm.error}
      onRetry={vm.retry}
      isEmpty={vm.items.length === 0}
      empty={<EmptyState illustration="retail" title="Nothing here yet." description="Add what you sell, so sales capture takes one tap." />}
      actions={
        vm.canManage ? (
          <Button mode="contained" icon="plus" onPress={onCreate}>
            Add product or service
          </Button>
        ) : null
      }
    >
      {vm.items.map((product, index) => (
        <View key={product.id}>
          {index > 0 ? <Divider /> : null}
          <List.Item
            title={product.name}
            description={`${vm.money(product.sellingPrice)} per ${product.unit}`}
            onPress={() => onOpen(product.id)}
            left={() => <IconTile icon={product.kind === 'service' ? 'room-service-outline' : 'tag-outline'} />}
            right={() => (product.isActive ? null : <StatusPill label="Inactive" tone="neutral" />)}
          />
        </View>
      ))}
    </ListShell>
  );
}

const styles = StyleSheet.create({
  search: { backgroundColor: supporting.white, borderWidth: 1, borderColor: supporting.line },
  searchInput: { minHeight: 0 },
  filter: { flex: 1, minWidth: 0 },
  list: { padding: spacing.xs, gap: 0 },
  rowEnd: { alignItems: 'flex-end', justifyContent: 'center', gap: spacing.xs },
  amount: { fontWeight: '700', color: palette.deepTeal },
  voided: { textDecorationLine: 'line-through', color: supporting.mutedText },
});
