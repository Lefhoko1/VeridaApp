// A file chosen on the device, before it is uploaded.
export type PickedFile = {
  uri: string;
  name: string;
  mimeType: string;
  // On the web the picker hands back the browser's File, which is read directly.
  webFile?: Blob;
};

// Where a business keeps its files. Each folder follows the permission of the data it belongs to.
export type BusinessFileFolder = 'receipts' | 'products' | 'logo' | 'plan';

// A business's stored files: receipts, product photos and its logo. Files are private, so they are
// shown through short-lived links.
export interface BusinessFileStore {
  upload(businessId: string, folder: BusinessFileFolder, file: PickedFile): Promise<string>;
  linkFor(path: string): Promise<string>;
  linksFor(paths: string[]): Promise<Record<string, string>>;
  remove(path: string): Promise<void>;
}

export const isPdf = (pathOrMime: string) => /pdf$/i.test(pathOrMime);
