import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

export type PickedFile = { name: string; content: string };

export async function pickTextFile(mimeTypes: string[]): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: mimeTypes, copyToCacheDirectory: true });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  if (Platform.OS === 'web' && asset.file) {
    return { name: asset.name, content: await asset.file.text() };
  }
  return { name: asset.name, content: await new File(asset.uri).text() };
}
