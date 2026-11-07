import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { errorMessage } from '@/core/errors/AppError';
import { joinChoices, splitChoices } from '@/core/forms/choices';
import { useForm } from '@/core/forms/useForm';
import { COUNTRY_OPTIONS, CURRENCY_OPTIONS, currencyForCountry } from '@/core/geo/countries';
import { businessScope } from '@/core/query/queryClient';
import { useFeedback } from '@/design-system';

import type { BusinessDetails, Workspace } from '../../domain/models';
import { BUSINESS_SIZES, BUSINESS_STAGES, businessDetailsSchema } from '../../domain/validation';
import { useBusinessDependencies } from '../di';
import { useBusinessContext } from './useActiveBusiness';

export const SETUP_STEPS = 3;

function initialValues(existing: Workspace | null | undefined) {
  return {
    name: existing?.name ?? '',
    industryCode: existing?.industryCode ?? '',
    additionalIndustries: (existing?.additionalIndustries ?? []).join(','),
    otherType: existing?.otherType ?? '',
    stage: existing?.stage ?? BUSINESS_STAGES[0] ?? '',
    size: existing?.size ?? BUSINESS_SIZES[0] ?? '',
    country: existing?.country ?? '',
    location: existing?.location ?? '',
    currency: existing?.currency ?? '',
    mainGoal: existing?.mainGoal ?? '',
    recordKeeping: existing?.recordKeeping ?? '',
  };
}

// The prototype's three-step setup, used both to register a business and to edit its profile.
export function useBusinessSetupViewModel({ existing, onDone }: { existing?: Workspace; onDone?: () => void } = {}) {
  const { businesses } = useBusinessDependencies();
  const { refresh, switchTo } = useBusinessContext();
  const feedback = useFeedback();
  const queryClient = useQueryClient();
  const form = useForm(businessDetailsSchema, initialValues(existing));
  const industries = useQuery({
    queryKey: ['platform', 'industries'],
    queryFn: () => businesses.listIndustries(),
    staleTime: Infinity,
  });

  const { values, setValue } = form;
  const [step, setStep] = useState(0);
  const [industryError, setIndustryError] = useState<string | null>(null);
  // Which country the current currency came from, so the form can say so until someone overrides it.
  const [currencyFrom, setCurrencyFrom] = useState<string | null>(null);

  // The first type chosen is the main one, and the rest follow in the order they were chosen.
  const selectedIndustries = [values.industryCode, ...values.additionalIndustries.split(',')].filter(Boolean);
  const applyIndustries = (codes: string[]) => {
    setValue('industryCode', codes[0] ?? '');
    setValue('additionalIndustries', codes.slice(1).join(','));
    setIndustryError(null);
  };
  const allIndustryCodes = (industries.data ?? []).map((industry) => industry.code);

  const save = useMutation({
    mutationFn: async (details: BusinessDetails) => {
      if (existing) {
        await businesses.update(existing.id, details);
        return existing.id;
      }
      return businesses.register(details);
    },
    onSuccess: async (businessId) => {
      switchTo(businessId);
      await refresh();
      await queryClient.invalidateQueries({ queryKey: businessScope(businessId) });
      feedback.success(existing ? 'Your business has been updated.' : 'Your workspace is ready.');
      onDone?.();
    },
    onError: (error) => feedback.error(errorMessage(error)),
  });

  return {
    isEditing: Boolean(existing),
    step,
    isLastStep: step === SETUP_STEPS - 1,
    industries: industries.data ?? [],
    loadingIndustries: industries.isPending,
    form,
    selectedIndustries,
    industryError,
    toggleIndustry(code: string) {
      applyIndustries(selectedIndustries.includes(code) ? selectedIndustries.filter((item) => item !== code) : [...selectedIndustries, code]);
    },
    allIndustriesSelected: allIndustryCodes.length > 0 && allIndustryCodes.every((code) => selectedIndustries.includes(code)),
    toggleAllIndustries() {
      const everything = allIndustryCodes.every((code) => selectedIndustries.includes(code));
      applyIndustries(everything ? [] : [...selectedIndustries, ...allIndustryCodes.filter((code) => !selectedIndustries.includes(code))]);
    },
    otherTypeSelected: selectedIndustries.includes('other'),
    countryOptions: COUNTRY_OPTIONS,
    currencyOptions: CURRENCY_OPTIONS,
    // Picking a country fills in its currency, which can still be changed afterwards.
    selectCountry(country: string) {
      setValue('country', country);
      const currency = currencyForCountry(country);
      if (currency) {
        setValue('currency', currency);
        setCurrencyFrom(country);
      }
    },
    selectCurrency(currency: string) {
      setValue('currency', currency);
      setCurrencyFrom(null);
    },
    currencyHint: currencyFrom ? `Suggested for ${currencyFrom}. You can choose another.` : undefined,
    goals: splitChoices(values.mainGoal),
    setGoals: (choices: string[]) => setValue('mainGoal', joinChoices(choices)),
    recordKeepingChoices: splitChoices(values.recordKeeping),
    setRecordKeepingChoices: (choices: string[]) => setValue('recordKeeping', joinChoices(choices)),
    saving: save.isPending,
    back: () => setStep((current) => Math.max(0, current - 1)),
    next() {
      if (step === 0) {
        if (selectedIndustries.length === 0) {
          setIndustryError('Choose at least one business type.');
          return;
        }
        setStep(1);
        return;
      }
      // Everything required is on the first two steps, so errors show before moving on.
      const details = form.validate();
      if (!details) {
        setStep(1);
        return;
      }
      if (step < SETUP_STEPS - 1) setStep(step + 1);
      else save.mutate(details);
    },
  };
}
