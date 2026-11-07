import { CsvImportScreen } from '@/design-system';

import { useExpensesImportViewModel, useSalesImportViewModel } from '../viewmodels/useRecordImportViewModels';

export function ImportSalesScreen({ onDone }: { onDone: () => void }) {
  const vm = useSalesImportViewModel(onDone);
  return (
    <CsvImportScreen
      title="Import sales"
      columns={vm.columns}
      example={vm.example}
      fileName={vm.fileName}
      analysis={vm.analysis}
      error={vm.error}
      canCommit={vm.canCommit && vm.canImport}
      committing={vm.committing}
      onChooseFile={vm.chooseFile}
      onCommit={vm.commit}
    />
  );
}

export function ImportExpensesScreen({ onDone }: { onDone: () => void }) {
  const vm = useExpensesImportViewModel(onDone);
  return (
    <CsvImportScreen
      title="Import expenses"
      columns={vm.columns}
      example={vm.example}
      fileName={vm.fileName}
      analysis={vm.analysis}
      error={vm.error}
      canCommit={vm.canCommit && vm.canImport}
      committing={vm.committing}
      onChooseFile={vm.chooseFile}
      onCommit={vm.commit}
    />
  );
}
