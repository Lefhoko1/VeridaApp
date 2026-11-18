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
  const categories = useQuery({
    queryKey: ['platform', 'business-categories'],
    queryFn: () => businesses.listCategories(),
    staleTime: Infinity,
  });

  const { values, setValue } = form;
  const [step, setStep] = useState(0);
  const [industryError, setIndustryError] = useState<string | null>(null);
  // The category chosen on screen. Until someone picks one, it follows the main type's category.
  const [chosenCategory, setChosenCategory] = useState<string | null>(null);
  // Which country the current currency came from, so the form can say so until someone overrides it.
  const [currencyFrom, setCurrencyFrom] = useState<string | null>(null);

  const industryList = industries.data ?? [];
  const categoryList = categories.data ?? [];
  const additionalIndustries = values.additionalIndustries.split(',').filter(Boolean);
  const categoryCode = chosenCategory ?? industryList.find((industry) => industry.code === values.industryCode)?.categoryCode ?? '';
  const categoryName = (code: string) => categoryList.find((category) => category.code === code)?.name ?? '';
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
    loadingIndustries: industries.isPending || categories.isPending,
    form,
    // Step 1 of the taxonomy's onboarding: one main category, then one type within it.
    categories: categoryList,
    categoryCode,
    chooseCategory(code: string) {
      setChosenCategory(code);
      setIndustryError(null);
      const current = industryList.find((industry) => industry.code === values.industryCode);
      if (current && current.categoryCode !== code) setValue('industryCode', '');
    },
    mainTypeOptions: industryList.filter((industry) => industry.categoryCode === categoryCode).map((industry) => ({ value: industry.code, label: industry.name })),
    chooseMainType(code: string) {
      setValue('industryCode', code);
      setValue('additionalIndustries', additionalIndustries.filter((item) => item !== code).join(','));
      setIndustryError(null);
    },
    // Step 2: anything else the business does, from any category, all optional.
    additionalIndustries,
    additionalOptions: industryList
      .filter((industry) => industry.code !== values.industryCode)
      .map((industry) => ({ value: industry.code, label: `${industry.name} (${categoryName(industry.categoryCode)})` })),
    setAdditionalIndustries: (codes: string[]) => setValue('additionalIndustries', codes.filter((code) => code !== values.industryCode).join(',')),
    industryError,
    otherTypeSelected: [values.industryCode, ...additionalIndustries].includes('other'),
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
        if (!values.industryCode) {
          setIndustryError(categoryCode ? 'Choose your type of business.' : 'Choose the kind of business you run.');
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
