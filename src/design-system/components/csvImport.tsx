import { StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

import { spacing, radius } from '../theme/theme';
import { supporting } from '../theme/palette';
import { Button } from './button';
import { Panel, Screen, SectionHeader } from './layout';
import { Notice, StatusPill } from './status';

type CsvImportScreenProps = {
  title: string;
  columns: string;
  example: string;
  fileName: string | null;
  analysis: { valid: unknown[]; problems: { line: number; message: string }[]; missingColumns: string[]; totalRows: number } | null;
  error: string | null;
  canCommit: boolean;
  committing: boolean;
  onChooseFile: () => void;
  onCommit: () => void;
};

const SHOWN_PROBLEMS = 50;

// FR-C12 to FR-C14: the same steps for every kind of record.
export function CsvImportScreen({ title, columns, example, fileName, analysis, error, canCommit, committing, onChooseFile, onCommit }: CsvImportScreenProps) {
  return (
    <Screen>
      <Panel>
        <SectionHeader title={title} description="Upload a CSV file. Every row is checked before anything is saved." />
        <Text variant="bodySmall">Columns: {columns}</Text>
        <Text style={styles.example}>{example}</Text>
        <Button mode="outlined" icon="file-upload-outline" onPress={onChooseFile} disabled={committing}>
          {fileName ? 'Choose a different file' : 'Choose a CSV file'}
        </Button>
      </Panel>

      {error ? <Notice title="The import did not complete">{error}</Notice> : null}

      {analysis ? (
        <Panel>
          <SectionHeader title={fileName ?? 'Your file'} description={`${analysis.totalRows} rows found`} action={<StatusPill label={canCommit ? 'Ready' : 'Needs fixing'} tone={canCommit ? 'ok' : 'warn'} />} />
          {analysis.missingColumns.length > 0 ? <Notice title="Missing columns">{analysis.missingColumns.join(', ')}</Notice> : null}
          {analysis.missingColumns.length === 0 ? (
            <Text variant="bodyMedium">
              {analysis.valid.length} valid, {analysis.problems.length} with problems.
            </Text>
          ) : null}
          {analysis.problems.slice(0, SHOWN_PROBLEMS).map((problem) => (
            <Text key={`${problem.line}-${problem.message}`} style={styles.problem}>
              {problem.line > 0 ? `Line ${problem.line}: ` : ''}
              {problem.message}
            </Text>
          ))}
          {analysis.problems.length > SHOWN_PROBLEMS ? <Text variant="bodySmall">And {analysis.problems.length - SHOWN_PROBLEMS} more.</Text> : null}
          {analysis.problems.length > 0 ? <Notice>Nothing has been saved. Correct these rows and choose the file again.</Notice> : null}
          {canCommit ? (
            <Button mode="contained" onPress={onCommit} loading={committing} disabled={committing}>
              Import {analysis.valid.length} records
            </Button>
          ) : null}
        </Panel>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  example: { fontFamily: 'monospace', fontSize: 11, backgroundColor: supporting.neutralWash, padding: spacing.sm, borderRadius: radius.sm },
  problem: { fontSize: 12, color: supporting.error },
});
