import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { AppError } from '@/core/errors/AppError';

import type { Sale } from '../../domain/models';
import { RecordsDependenciesProvider, type RecordsDependencies } from '../di';
import { useSaleDetailViewModel, useSaleFormViewModel } from './useSalesViewModels';

const mockFeedback = { success: jest.fn(), error: jest.fn() };
const mockPermissions = new Set(['records.create', 'records.edit', 'records.void']);

jest.mock('@/design-system', () => ({ useFeedback: () => mockFeedback }));
jest.mock('@/core/files/pickFile', () => ({
  takePhoto: jest.fn(),
  chooseDocument: jest.fn(),
  choosePhoto: jest.fn(async () => ({ uri: 'file:///receipt.jpg', name: 'receipt.jpg', mimeType: 'image/jpeg' })),
}));
jest.mock('@/modules/business', () => ({
  useActiveBusiness: () => ({
    business: { id: 'biz-1', currency: 'BWP' },
    can: (permission: string) => mockPermissions.has(permission),
  }),
}));

const SALE: Sale = {
  id: 'sale-1',
  occurredOn: '2026-10-01',
  productId: null,
  itemName: 'Egg tray',
  category: 'Egg sales',
  quantity: 2,
  unit: 'trays',
  unitPrice: 42,
  totalAmount: 84,
  notes: null,
  status: 'recorded',
  voidReason: null,
  receiptPaths: [],
};

function fakeDependencies(): RecordsDependencies {
  return {
    sales: {
      list: jest.fn(async () => []),
      get: jest.fn(async () => SALE),
      create: jest.fn(async () => undefined),
      createMany: jest.fn(async () => undefined),
      update: jest.fn(async () => undefined),
      void: jest.fn(async () => undefined),
    },
    expenses: {} as RecordsDependencies['expenses'],
    products: {
      list: jest.fn(async () => [{ id: 'p1', kind: 'product' as const, name: 'Tray', category: null, description: null, unit: 'tray', sellingPrice: 45, isActive: true, imagePath: null }]),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      setActive: jest.fn(),
      remove: jest.fn(),
    },
    categories: {
      list: jest.fn(async () => ['Egg sales', 'Other']),
      listOptions: jest.fn(async () => [
        { name: 'Egg sales', groupCode: 'product_sales', groupName: 'Product sales' },
        { name: 'Other', groupCode: null, groupName: null },
      ]),
      add: jest.fn(),
    },
    files: { upload: jest.fn(), linkFor: jest.fn(), linksFor: jest.fn(async () => ({})), remove: jest.fn() },
    receipts: {
      read: jest.fn(async () => ({ occurredOn: '2026-11-02', total: 90, description: 'Egg tray', vendor: null, category: 'egg sales', quantity: 3, unit: null, unitPrice: null })),
    },
  };
}

function setup(props: { saleId?: string } = {}) {
  const deps = fakeDependencies();
  const onDone = jest.fn();
  // gcTime: Infinity starts no cleanup timer, so nothing keeps the test worker alive.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  const invalidate = jest.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <RecordsDependenciesProvider value={deps}>{children}</RecordsDependenciesProvider>
    </QueryClientProvider>
  );
  return { deps, onDone, invalidate, wrapper, props };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions.clear();
  ['records.create', 'records.edit', 'records.void'].forEach((p) => mockPermissions.add(p));
});

describe('useSaleFormViewModel', () => {
  it('saves valid input through the repository and refreshes all business data (FR-E08)', async () => {
    const { deps, onDone, invalidate, wrapper } = setup();
    const { result } = await renderHook(() => useSaleFormViewModel({ onDone }), { wrapper });

    await waitFor(() => expect(result.current.form.values.category).toBe('Egg sales'));
    await act(async () => {
      result.current.form.setValue('itemName', 'Egg tray');
      result.current.form.setValue('quantity', '2');
      result.current.form.setValue('unitPrice', '42');
    });
    await act(async () => result.current.submit());

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(deps.sales.create).toHaveBeenCalledWith('biz-1', expect.objectContaining({ itemName: 'Egg tray', quantity: 2, unitPrice: 42 }));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['business', 'biz-1'] });
    expect(mockFeedback.success).toHaveBeenCalledWith('Sale recorded.');
  });

  it('blocks invalid input before reaching the repository (FR-C08)', async () => {
    const { deps, onDone, wrapper } = setup();
    const { result } = await renderHook(() => useSaleFormViewModel({ onDone }), { wrapper });

    await act(async () => result.current.submit());

    expect(deps.sales.create).not.toHaveBeenCalled();
    expect(result.current.form.errors.itemName).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
  });

  it('shows the live total, calculated from quantity and price (FR-C21)', async () => {
    const { onDone, wrapper } = setup();
    const { result } = await renderHook(() => useSaleFormViewModel({ onDone }), { wrapper });

    await act(async () => {
      result.current.form.setValue('quantity', '1.5');
      result.current.form.setValue('unitPrice', '42');
    });

    expect(result.current.totalPreview).toBe('P63.00');
  });

  it('fills in details when a catalogue item is chosen', async () => {
    const { onDone, wrapper } = setup();
    const { result } = await renderHook(() => useSaleFormViewModel({ onDone }), { wrapper });

    await waitFor(() => expect(result.current.productOptions).toHaveLength(2));
    await act(async () => result.current.selectProduct('p1'));

    expect(result.current.form.values).toMatchObject({ productId: 'p1', itemName: 'Tray', unit: 'tray', unitPrice: '45' });
  });

  it('loads an existing sale and updates it rather than creating one', async () => {
    const { deps, onDone, wrapper } = setup();
    const { result } = await renderHook(() => useSaleFormViewModel({ saleId: 'sale-1', onDone }), { wrapper });

    await waitFor(() => expect(result.current.form.values.itemName).toBe('Egg tray'));
    await act(async () => result.current.submit());

    await waitFor(() => expect(deps.sales.update).toHaveBeenCalledWith('sale-1', expect.objectContaining({ quantity: 2 })));
    expect(deps.sales.create).not.toHaveBeenCalled();
  });

  it('reports a repository failure and stays on the form (section 7)', async () => {
    const { deps, onDone, wrapper } = setup();
    (deps.sales.create as jest.Mock).mockRejectedValue(new AppError('forbidden', 'You do not have permission to do this.'));
    const { result } = await renderHook(() => useSaleFormViewModel({ onDone }), { wrapper });

    await act(async () => {
      result.current.form.setValue('itemName', 'Egg tray');
      result.current.form.setValue('category', 'Egg sales');
      result.current.form.setValue('unitPrice', '42');
    });
    await act(async () => result.current.submit());

    await waitFor(() => expect(mockFeedback.error).toHaveBeenCalledWith('You do not have permission to do this.'));
    expect(onDone).not.toHaveBeenCalled();
  });

  it('follows permissions when offering edit and void on the profile (FR-B26)', async () => {
    mockPermissions.delete('records.void');
    const { wrapper } = setup();
    const { result } = await renderHook(() => useSaleDetailViewModel('sale-1'), { wrapper });

    await waitFor(() => expect(result.current.sale?.itemName).toBe('Egg tray'));
    expect(result.current.canEdit).toBe(true);
    expect(result.current.canVoid).toBe(false);
  });

  it('passes the trimmed reason when voiding, and stays on the profile', async () => {
    const { deps, onDone, wrapper } = setup();
    const { result } = await renderHook(() => useSaleDetailViewModel('sale-1'), { wrapper });

    await waitFor(() => expect(result.current.canVoid).toBe(true));
    await act(async () => result.current.setVoidReason('  Entered twice  '));
    await act(async () => result.current.confirmVoid());

    await waitFor(() => expect(deps.sales.void).toHaveBeenCalledWith('sale-1', 'Entered twice'));
    await waitFor(() => expect(mockFeedback.success).toHaveBeenCalled());
    expect(onDone).not.toHaveBeenCalled();
  });

  it('makes a voided sale read-only', async () => {
    const { deps, onDone, wrapper } = setup();
    (deps.sales.get as jest.Mock).mockResolvedValue({ ...SALE, status: 'voided', voidReason: 'Mistake' });
    const form = await renderHook(() => useSaleFormViewModel({ saleId: 'sale-1', onDone }), { wrapper });
    const profile = await renderHook(() => useSaleDetailViewModel('sale-1'), { wrapper });

    await waitFor(() => expect(form.result.current.isVoided).toBe(true));
    await waitFor(() => expect(profile.result.current.isVoided).toBe(true));
    expect(form.result.current.canSave).toBe(false);
    expect(profile.result.current.canEdit).toBe(false);
    expect(profile.result.current.canVoid).toBe(false);
    expect(profile.result.current.sale?.voidReason).toBe('Mistake');
  });

  it('remembers a category typed under Other, without blocking the sale if that fails', async () => {
    const { deps, onDone, wrapper } = setup();
    (deps.categories.add as jest.Mock).mockRejectedValue(new Error('Already there'));
    const { result } = await renderHook(() => useSaleFormViewModel({ onDone }), { wrapper });

    await waitFor(() => expect(result.current.categoryOptions.length).toBeGreaterThan(0));
    await act(async () => {
      result.current.form.setValue('itemName', 'Eggs');
      result.current.form.setValue('category', 'Market stall');
      result.current.form.setValue('unitPrice', '42');
    });
    await act(async () => result.current.submit());

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(deps.categories.add).toHaveBeenCalledWith(expect.any(String), 'sale', 'Market stall');
    expect(deps.sales.create).toHaveBeenCalled();
  });

  it('does not add a category that is already listed', async () => {
    const { deps, onDone, wrapper } = setup();
    const { result } = await renderHook(() => useSaleFormViewModel({ onDone }), { wrapper });

    await waitFor(() => expect(result.current.categoryOptions.length).toBeGreaterThan(0));
    await act(async () => {
      result.current.form.setValue('itemName', 'Eggs');
      result.current.form.setValue('category', 'Egg sales');
      result.current.form.setValue('unitPrice', '42');
    });
    await act(async () => result.current.submit());

    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(deps.categories.add).not.toHaveBeenCalled();
  });

  it('attaches a receipt, reads it into the form for checking, and saves it with the sale', async () => {
    const { deps, onDone, wrapper } = setup();
    (deps.files.upload as jest.Mock).mockResolvedValue('biz-1/receipts/abc.jpg');
    const { result } = await renderHook(() => useSaleFormViewModel({ onDone }), { wrapper });
    await waitFor(() => expect(result.current.form.values.category).toBe('Egg sales'));

    await act(async () => result.current.receipt.choosePhoto());
    await waitFor(() => expect(result.current.receipt.paths).toEqual(['biz-1/receipts/abc.jpg']));
    expect(deps.files.upload).toHaveBeenCalledWith('biz-1', 'receipts', expect.objectContaining({ mimeType: 'image/jpeg' }));

    await act(async () => result.current.receipt.readReceipt('biz-1/receipts/abc.jpg'));
    await waitFor(() => expect(result.current.form.values.itemName).toBe('Egg tray'));
    expect(deps.receipts.read).toHaveBeenCalledWith(expect.objectContaining({ businessId: 'biz-1', path: 'biz-1/receipts/abc.jpg', kind: 'sale' }));
    // A total of 90 for 3 items becomes a unit price of 30, and the category matches whatever its case.
    expect(result.current.form.values).toMatchObject({ occurredOn: '2026-11-02', quantity: '3', unitPrice: '30', category: 'Egg sales' });
    // Reading never saves: the user confirms first (FR-G20).
    expect(deps.sales.create).not.toHaveBeenCalled();

    await act(async () => result.current.submit());
    await waitFor(() => expect(deps.sales.create).toHaveBeenCalledWith('biz-1', expect.objectContaining({ receiptPaths: ['biz-1/receipts/abc.jpg'] })));
    // A saved receipt is kept.
    expect(deps.files.remove).not.toHaveBeenCalled();
  });

  it('deletes receipts that were uploaded but never saved when the form closes', async () => {
    const { deps, onDone, wrapper } = setup();
    (deps.files.upload as jest.Mock).mockResolvedValueOnce('biz-1/receipts/one.jpg').mockResolvedValueOnce('biz-1/receipts/two.jpg');
    (deps.files.remove as jest.Mock).mockResolvedValue(undefined);
    const { result, unmount } = await renderHook(() => useSaleFormViewModel({ onDone }), { wrapper });

    await act(async () => result.current.receipt.choosePhoto());
    await act(async () => result.current.receipt.choosePhoto());
    await waitFor(() => expect(result.current.receipt.paths).toEqual(['biz-1/receipts/one.jpg', 'biz-1/receipts/two.jpg']));

    // Removing an unsaved receipt deletes it straight away.
    await act(async () => result.current.receipt.remove('biz-1/receipts/one.jpg'));
    expect(deps.files.remove).toHaveBeenCalledWith('biz-1/receipts/one.jpg');

    // Leaving without saving deletes the rest.
    await act(async () => unmount());
    expect(deps.files.remove).toHaveBeenCalledWith('biz-1/receipts/two.jpg');
  });

  it('deletes a saved receipt the user removed only once the change is saved', async () => {
    const { deps, onDone, wrapper } = setup();
    (deps.sales.get as jest.Mock).mockResolvedValue({ ...SALE, receiptPaths: ['biz-1/receipts/old.jpg'] });
    (deps.files.remove as jest.Mock).mockResolvedValue(undefined);
    const { result } = await renderHook(() => useSaleFormViewModel({ saleId: 'sale-1', onDone }), { wrapper });
    await waitFor(() => expect(result.current.receipt.paths).toEqual(['biz-1/receipts/old.jpg']));

    await act(async () => result.current.receipt.remove('biz-1/receipts/old.jpg'));
    expect(deps.files.remove).not.toHaveBeenCalled();

    await act(async () => result.current.submit());
    await waitFor(() => expect(deps.sales.update).toHaveBeenCalledWith('sale-1', expect.objectContaining({ receiptPaths: [] })));
    await waitFor(() => expect(deps.files.remove).toHaveBeenCalledWith('biz-1/receipts/old.jpg'));
  });
});
