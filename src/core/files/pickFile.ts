import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { AppError } from '../errors/AppError';
import type { PickedFile } from './types';

// Photos are compressed on the device, which keeps a receipt photo to a few hundred kilobytes.
const PHOTO_QUALITY = 0.6;

function fromImage(result: ImagePicker.ImagePickerResult): PickedFile | null {
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const mimeType = asset.mimeType ?? 'image/jpeg';
  return {
    uri: asset.uri,
    name: asset.fileName ?? `photo.${mimeType.split('/')[1] ?? 'jpg'}`,
    mimeType,
    webFile: asset.file,
  };
}

export async function takePhoto(): Promise<PickedFile | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new AppError('forbidden', 'Verida needs access to the camera to take a photo. You can allow it in your device settings.');
  }
  return fromImage(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: PHOTO_QUALITY }));
}

export async function choosePhoto(): Promise<PickedFile | null> {
  return fromImage(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: PHOTO_QUALITY }));
}

// A receipt may also arrive as a PDF, such as one emailed by a supplier.
export async function chooseDocument(mimeTypes: string[]): Promise<PickedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: mimeTypes, copyToCacheDirectory: true });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, name: asset.name, mimeType: asset.mimeType ?? 'application/octet-stream', webFile: asset.file };
}
