import { File } from 'expo-file-system';
import { Platform } from 'react-native';

import { AppError } from '../errors/AppError';
import type { BusinessFileFolder, BusinessFileStore, PickedFile } from '../files/types';
import type { SupabaseClient } from './client';
import { mapProviderError } from './mapError';

const BUCKET = 'business-files';
// Long enough to view a page, short enough that a copied link soon stops working.
const LINK_SECONDS = 60 * 60;
const MAX_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'application/pdf': 'pdf',
};

async function readBytes(file: PickedFile): Promise<ArrayBuffer> {
  if (Platform.OS === 'web' && file.webFile) return file.webFile.arrayBuffer();
  return new File(file.uri).arrayBuffer();
}

const uniqueName = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// Files sit under <business id>/<folder>/, which storage rules use to apply the business's permissions.
export class SupabaseBusinessFileStore implements BusinessFileStore {
  constructor(private readonly client: SupabaseClient) {}

  private get bucket() {
    return this.client.storage.from(BUCKET);
  }

  async upload(businessId: string, folder: BusinessFileFolder, file: PickedFile): Promise<string> {
    const extension = EXTENSIONS[file.mimeType];
    if (!extension) throw new AppError('validation', 'Choose a photo (JPEG, PNG, WebP or HEIC) or a PDF.');
    const bytes = await readBytes(file);
    if (bytes.byteLength > MAX_BYTES) throw new AppError('validation', 'This file is larger than 10 MB. Choose a smaller one.');
    const path = `${businessId}/${folder}/${uniqueName()}.${extension}`;
    const { error } = await this.bucket.upload(path, bytes, { contentType: file.mimeType, upsert: false });
    if (error) throw mapProviderError(error);
    return path;
  }

  async linkFor(path: string): Promise<string> {
    const { data, error } = await this.bucket.createSignedUrl(path, LINK_SECONDS);
    if (error || !data) throw mapProviderError(error ?? { message: 'No link returned.' });
    return data.signedUrl;
  }

  async linksFor(paths: string[]): Promise<Record<string, string>> {
    if (paths.length === 0) return {};
    const { data, error } = await this.bucket.createSignedUrls(paths, LINK_SECONDS);
    if (error) throw mapProviderError(error);
    const links: Record<string, string> = {};
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) links[item.path] = item.signedUrl;
    }
    return links;
  }

  async remove(path: string): Promise<void> {
    const { error } = await this.bucket.remove([path]);
    if (error) throw mapProviderError(error);
  }
}
