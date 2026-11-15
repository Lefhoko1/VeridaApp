import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { useAttachments } from '@/core/files/useAttachment';
import { isPdf } from '@/core/files/types';
import { businessScope } from '@/core/query/queryClient';
import { useFeedback } from '@/design-system';
import { useActiveBusiness } from '@/modules/business';

import type { ReceiptKind, ReceiptReading } from '../../domain/receipts';
import { useRecordsDependencies } from '../di';

const LINK_FRESH_MS = 30 * 60 * 1000;
const NO_LINKS: Record<string, string> = {};

// Short-lived links to show stored files, such as a record's receipts. A file that cannot be
// linked is left out rather than failing the page.
export function useFileLinks(paths: string[] | undefined) {
  const { files } = useRecordsDependencies();
  const { business } = useActiveBusiness();
  const wanted = paths ?? [];
  const links = useQuery({
    queryKey: [...businessScope(business.id), 'file-links', wanted],
    queryFn: () => files.linksFor(wanted),
    enabled: wanted.length > 0,
    staleTime: LINK_FRESH_MS,
  });
  const map = links.data ?? NO_LINKS;
  return {
    links: map,
    files: wanted.flatMap((path) => (map[path] ? [{ url: map[path], isPdf: isPdf(path) }] : [])),
  };
}

// A short-lived link to one stored file, such as a product photo.
export function useFileLink(path: string | null | undefined) {
  const { links } = useFileLinks(path ? [path] : undefined);
  return { url: path ? (links[path] ?? null) : null };
}

type ReceiptOptions = {
  kind: ReceiptKind;
  // The receipts the record already has, once an existing record has loaded.
  existingPaths: string[] | undefined;
  categories: string[];
  // Puts what the AI read into the form, for the user to check.
  apply: (reading: ReceiptReading) => void;
};

// The receipts on a sale or expense form: attach several, and let the AI read any one of them into
// the form. Call `commit` once the record is saved.
export function useReceipts({ kind, existingPaths, categories, apply }: ReceiptOptions) {
  const { files, receipts } = useRecordsDependencies();
  const { business } = useActiveBusiness();
  const feedback = useFeedback();
  const attachments = useAttachments({ store: files, businessId: business.id, folder: 'receipts', allowPdf: true });
  const existing = useFileLinks(existingPaths);
  const { load } = attachments;

  // Load a record's receipts once, so a later refresh never drops ones the user just added.
  const loadedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!existingPaths) return;
    const key = existingPaths.join('|');
    if (loadedFor.current === key) return;
    loadedFor.current = key;
    load(existingPaths, NO_LINKS);
  }, [existingPaths, load]);

  const read = useMutation({
    mutationFn: (path: string) => receipts.read({ businessId: business.id, path, kind, categories }),
    onSuccess: (reading) => {
      apply(reading);
      feedback.success('Filled in from the receipt. Check each value before saving.');
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  return {
    ...attachments,
    // Stored receipts show through their links once those arrive.
    files: attachments.files.map((file) => (file.previewUri || file.isPdf ? file : { ...file, previewUri: existing.links[file.path] ?? null })),
    reading: read.isPending,
    readReceipt: (path: string) => read.mutate(path),
  };
}

export type ReceiptsViewModel = ReturnType<typeof useReceipts>;
