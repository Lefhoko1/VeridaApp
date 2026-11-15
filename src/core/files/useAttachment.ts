import { useCallback, useEffect, useRef, useState } from 'react';

import { errorMessage } from '../errors/AppError';
import { choosePhoto, chooseDocument, takePhoto } from './pickFile';
import { isPdf, type BusinessFileFolder, type BusinessFileStore, type PickedFile } from './types';

export const MAX_RECEIPTS = 10;

type Options = {
  store: BusinessFileStore;
  businessId: string;
  folder: BusinessFileFolder;
  // Receipts may be PDFs; photos and logos are images only.
  allowPdf?: boolean;
};

export type AttachedFile = {
  path: string;
  // What to show: the file on this device just after choosing it, or a link to the stored copy.
  previewUri: string | null;
  isPdf: boolean;
};

// Keeps storage tidy for one form. A file uploaded but never saved is deleted when the form goes
// away, and a saved file the user removed is deleted only once the change is saved.
function useCleanup(store: BusinessFileStore) {
  const unsaved = useRef(new Set<string>());
  const removedSaved = useRef(new Set<string>());

  const discard = useCallback((path: string) => void store.remove(path).catch(() => undefined), [store]);

  useEffect(() => {
    const pending = unsaved.current;
    return () => pending.forEach(discard);
  }, [discard]);

  return {
    uploaded: (path: string) => unsaved.current.add(path),
    // A file removed before saving is deleted at once; a saved one waits for the save.
    removed: (path: string) => {
      if (unsaved.current.delete(path)) discard(path);
      else removedSaved.current.add(path);
    },
    // Call once the record is saved: new files are now kept, removed ones go.
    commit: () => {
      unsaved.current.clear();
      removedSaved.current.forEach(discard);
      removedSaved.current.clear();
    },
  };
}

function usePicking(attach: (file: PickedFile) => Promise<void>) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (pick: () => Promise<PickedFile | null>) => {
      setError(null);
      try {
        const file = await pick();
        if (!file) return;
        setUploading(true);
        await attach(file);
      } catch (failure) {
        setError(errorMessage(failure));
      } finally {
        setUploading(false);
      }
    },
    [attach],
  );
  return {
    uploading,
    error,
    setError,
    takePhoto: () => void run(takePhoto),
    choosePhoto: () => void run(choosePhoto),
    chooseDocument: () => void run(() => chooseDocument(['application/pdf', 'image/*'])),
  };
}

// Several files on a form, such as the receipts for one expense. Each is uploaded as soon as it is
// chosen, so the record only has to remember where they are.
export function useAttachments({ store, businessId, folder, allowPdf = false }: Options) {
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const cleanup = useCleanup(store);
  const { uploaded, removed, commit } = cleanup;

  const attach = useCallback(
    async (file: PickedFile) => {
      const path = await store.upload(businessId, folder, file);
      uploaded(path);
      setFiles((current) => [...current, { path, previewUri: isPdf(file.mimeType) ? null : file.uri, isPdf: isPdf(file.mimeType) }]);
    },
    [store, businessId, folder, uploaded],
  );
  const picking = usePicking(attach);

  // Shows the files a record already has, when an existing record is opened for editing.
  const load = useCallback((paths: string[], links: Record<string, string>) => {
    setFiles(paths.map((path) => ({ path, previewUri: isPdf(path) ? null : (links[path] ?? null), isPdf: isPdf(path) })));
  }, []);

  const full = files.length >= MAX_RECEIPTS;
  const guard = (action: () => void) => () => {
    if (full) picking.setError(`You can attach up to ${MAX_RECEIPTS} files.`);
    else action();
  };

  return {
    files,
    paths: files.map((file) => file.path),
    uploading: picking.uploading,
    error: picking.error,
    allowPdf,
    full,
    takePhoto: guard(picking.takePhoto),
    choosePhoto: guard(picking.choosePhoto),
    chooseDocument: guard(picking.chooseDocument),
    remove: (path: string) => {
      removed(path);
      setFiles((current) => current.filter((file) => file.path !== path));
    },
    load,
    commit,
  };
}

// One file: a product photo or a logo. Choosing a new one replaces the old.
export function useAttachment({ store, businessId, folder, onChange }: Options & { onChange?: (path: string | null) => void }) {
  const [file, setFileState] = useState<AttachedFile | null>(null);
  const current = useRef<AttachedFile | null>(null);
  const setFile = useCallback((next: AttachedFile | null) => {
    current.current = next;
    setFileState(next);
  }, []);
  const cleanup = useCleanup(store);
  const { uploaded, removed, commit } = cleanup;
  // A file saved the moment it changes (a logo) has no form to wait for.
  const savesAtOnce = Boolean(onChange);

  const replace = useCallback(
    (next: AttachedFile | null) => {
      const previous = current.current;
      if (previous && previous.path !== next?.path && !savesAtOnce) removed(previous.path);
      setFile(next);
      onChange?.(next?.path ?? null);
    },
    [removed, onChange, savesAtOnce, setFile],
  );

  const attach = useCallback(
    async (picked: PickedFile) => {
      const path = await store.upload(businessId, folder, picked);
      if (!savesAtOnce) uploaded(path);
      replace({ path, previewUri: picked.uri, isPdf: false });
    },
    [store, businessId, folder, uploaded, replace, savesAtOnce],
  );
  const picking = usePicking(attach);

  const load = useCallback(
    (path: string | null, link: string | null) => setFile(path ? { path, previewUri: link, isPdf: false } : null),
    [setFile],
  );

  return {
    path: file?.path ?? null,
    previewUri: file?.previewUri ?? null,
    uploading: picking.uploading,
    error: picking.error,
    takePhoto: picking.takePhoto,
    choosePhoto: picking.choosePhoto,
    remove: () => replace(null),
    load,
    commit,
  };
}
