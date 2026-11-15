import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
import { HelperText, Icon, Text } from 'react-native-paper';

import { palette, supporting } from '../theme/palette';
import { radius, spacing } from '../theme/theme';
import { Button } from './button';

type AttachmentFieldProps = {
  label: string;
  hint?: string;
  hasFile: boolean;
  previewUri: string | null;
  isPdf?: boolean;
  uploading: boolean;
  error: string | null;
  allowPdf?: boolean;
  disabled?: boolean;
  // Square for photos and logos, wide for other files.
  shape?: 'wide' | 'square';
  onTakePhoto: () => void;
  onChoosePhoto: () => void;
  onChooseDocument?: () => void;
  onRemove: () => void;
  // Something to do with the file once it is attached, such as reading a receipt.
  action?: ReactNode;
};

// Adds, replaces or removes one file on a form: a receipt, a product photo or a logo.
export function AttachmentField(props: AttachmentFieldProps) {
  const { label, hint, hasFile, previewUri, isPdf = false, uploading, error, allowPdf, disabled, shape = 'wide', action } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={[styles.frame, shape === 'square' && styles.frameSquare]}>
        {uploading ? (
          <ActivityIndicator color={palette.teal} accessibilityLabel="Uploading" />
        ) : previewUri ? (
          <Image source={{ uri: previewUri }} style={StyleSheet.absoluteFill} contentFit={shape === 'square' ? 'cover' : 'contain'} accessible accessibilityLabel={label} />
        ) : hasFile ? (
          <View style={styles.placeholder}>
            <Icon source={isPdf ? 'file-pdf-box' : 'image-outline'} size={34} color={palette.teal} />
            <Text style={styles.placeholderText}>{isPdf ? 'PDF attached' : 'Photo attached'}</Text>
          </View>
        ) : (
          <View style={styles.placeholder}>
            <Icon source={shape === 'square' ? 'image-plus' : 'receipt-text-outline'} size={34} color={supporting.mutedText} />
            <Text style={styles.placeholderText}>Nothing attached yet</Text>
          </View>
        )}
      </View>
      {disabled ? null : (
        <View style={styles.actions}>
          <Button mode="outlined" compact icon="camera-outline" onPress={props.onTakePhoto} disabled={uploading}>
            Take photo
          </Button>
          <Button mode="outlined" compact icon="image-outline" onPress={props.onChoosePhoto} disabled={uploading}>
            Choose photo
          </Button>
          {allowPdf && props.onChooseDocument ? (
            <Button mode="outlined" compact icon="file-document-outline" onPress={props.onChooseDocument} disabled={uploading}>
              Choose PDF
            </Button>
          ) : null}
          {hasFile ? (
            <Button mode="text" compact icon="close" textColor={supporting.error} onPress={props.onRemove} disabled={uploading}>
              Remove
            </Button>
          ) : null}
        </View>
      )}
      {hasFile && action ? <View style={styles.extra}>{action}</View> : null}
      {error ? (
        <HelperText type="error" padding="none">
          {error}
        </HelperText>
      ) : null}
    </View>
  );
}

type FileTile = { path: string; previewUri: string | null; isPdf: boolean };

type AttachmentsFieldProps = {
  label: string;
  hint?: string;
  files: FileTile[];
  uploading: boolean;
  error: string | null;
  allowPdf?: boolean;
  disabled?: boolean;
  full?: boolean;
  onTakePhoto: () => void;
  onChoosePhoto: () => void;
  onChooseDocument?: () => void;
  onRemove: (path: string) => void;
  // Something to do with one file, such as reading that receipt into the form.
  fileAction?: { label: string; busy: boolean; onPress: (path: string) => void };
};

// Several files on a form, such as the receipts for one expense, shown as tiles.
export function AttachmentsField(props: AttachmentsFieldProps) {
  const { label, hint, files, uploading, error, allowPdf, disabled, full, fileAction } = props;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      <View style={styles.tiles}>
        {files.map((file, index) => (
          <View key={file.path} style={styles.tileColumn}>
            <View style={styles.tile}>
              {file.previewUri ? (
                <Image source={{ uri: file.previewUri }} style={StyleSheet.absoluteFill} contentFit="cover" accessible accessibilityLabel={`${label} ${index + 1}`} />
              ) : (
                <View style={styles.placeholder}>
                  <Icon source={file.isPdf ? 'file-pdf-box' : 'image-outline'} size={30} color={palette.teal} />
                  <Text style={styles.placeholderText}>{file.isPdf ? 'PDF' : 'Photo'}</Text>
                </View>
              )}
              {disabled ? null : (
                <Pressable onPress={() => props.onRemove(file.path)} style={styles.removeBadge} accessibilityRole="button" accessibilityLabel={`Remove ${label.toLowerCase()} ${index + 1}`} hitSlop={8}>
                  <Icon source="close" size={14} color={supporting.white} />
                </Pressable>
              )}
            </View>
            {fileAction && !disabled ? (
              <Button mode="text" compact icon="creation-outline" onPress={() => fileAction.onPress(file.path)} disabled={fileAction.busy} loading={fileAction.busy}>
                {fileAction.label}
              </Button>
            ) : null}
          </View>
        ))}
        {uploading ? (
          <View style={[styles.tile, styles.tileEmpty]}>
            <ActivityIndicator color={palette.teal} accessibilityLabel="Uploading" />
          </View>
        ) : files.length === 0 ? (
          <View style={[styles.tile, styles.tileEmpty]}>
            <Icon source="receipt-text-outline" size={30} color={supporting.mutedText} />
            <Text style={styles.placeholderText}>None yet</Text>
          </View>
        ) : null}
      </View>
      {disabled || full ? null : (
        <View style={styles.actions}>
          <Button mode="outlined" compact icon="camera-outline" onPress={props.onTakePhoto} disabled={uploading}>
            Take photo
          </Button>
          <Button mode="outlined" compact icon="image-outline" onPress={props.onChoosePhoto} disabled={uploading}>
            Choose photo
          </Button>
          {allowPdf && props.onChooseDocument ? (
            <Button mode="outlined" compact icon="file-document-outline" onPress={props.onChooseDocument} disabled={uploading}>
              Choose PDF
            </Button>
          ) : null}
        </View>
      )}
      {error ? (
        <HelperText type="error" padding="none">
          {error}
        </HelperText>
      ) : null}
    </View>
  );
}

// Stored files on a profile page, such as a record's receipts. Tapping one opens the full file.
export function AttachmentGallery({ label, files }: { label: string; files: { url: string; isPdf: boolean }[] }) {
  if (files.length === 0) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.tiles}>
        {files.map((file, index) => (
          <Pressable key={file.url} onPress={() => void Linking.openURL(file.url)} accessibilityRole="link" accessibilityLabel={`Open ${label.toLowerCase()} ${index + 1}`} style={styles.tile}>
            {file.isPdf ? (
              <View style={styles.placeholder}>
                <Icon source="file-pdf-box" size={30} color={palette.teal} />
                <Text style={styles.placeholderText}>Open PDF</Text>
              </View>
            ) : (
              <Image source={{ uri: file.url }} style={StyleSheet.absoluteFill} contentFit="cover" />
            )}
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// A stored file on a profile page. Tapping it opens the full file.
export function AttachmentPreview({ label, url, isPdf, shape = 'wide' }: { label: string; url: string | null; isPdf: boolean; shape?: 'wide' | 'square' }) {
  if (!url) return null;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={() => void Linking.openURL(url)} accessibilityRole="link" accessibilityLabel={`Open ${label.toLowerCase()}`} style={[styles.frame, shape === 'square' && styles.frameSquare]}>
        {isPdf ? (
          <View style={styles.placeholder}>
            <Icon source="file-pdf-box" size={34} color={palette.teal} />
            <Text style={styles.placeholderText}>Open PDF</Text>
          </View>
        ) : (
          <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit={shape === 'square' ? 'cover' : 'contain'} />
        )}
      </Pressable>
    </View>
  );
}

// A small rounded picture for lists and headers, such as a product photo or a business logo.
export function Thumbnail({ uri, size = 44, fallbackIcon }: { uri: string | null; size?: number; fallbackIcon: string }) {
  return (
    <View style={[styles.thumb, { width: size, height: size, borderRadius: size * 0.28 }]}>
      {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon source={fallbackIcon} size={size * 0.5} color={palette.teal} />}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: spacing.sm },
  label: { fontWeight: '600', color: palette.deepTeal },
  hint: { fontSize: 12, color: supporting.mutedText },
  frame: {
    height: 180,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: supporting.mintBorder,
    backgroundColor: supporting.mintWash,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  frameSquare: { width: 160, height: 160 },
  placeholder: { alignItems: 'center', gap: spacing.xs },
  placeholderText: { fontSize: 12, color: supporting.mutedText },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  extra: { alignItems: 'flex-start' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  tileColumn: { alignItems: 'center' },
  tile: { width: 112, height: 112, borderRadius: radius.md, overflow: 'hidden', backgroundColor: supporting.mintWash, borderWidth: 1, borderColor: supporting.mintBorder, alignItems: 'center', justifyContent: 'center' },
  tileEmpty: { borderStyle: 'dashed', gap: spacing.xs },
  removeBadge: { position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(21, 60, 70, 0.75)', alignItems: 'center', justifyContent: 'center' },
  thumb: { backgroundColor: palette.softMint, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
