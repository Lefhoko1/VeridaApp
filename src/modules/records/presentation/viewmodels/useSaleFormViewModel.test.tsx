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
      list: jest.fn(async () => [{ id: 'p1', kind: 'product' as const, name: 'Tray', category: null, description: null, unit: 'tray', sellingPrice: 45, isActive: true }]),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      setActive: jest.fn(),
      remove: jest.fn(),
    },
    categories: { list: jest.fn(async () => ['Egg sales', 'Other']), add: jest.fn() },
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
});
