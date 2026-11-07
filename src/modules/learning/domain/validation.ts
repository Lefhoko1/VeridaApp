import { z } from 'zod';

import { optionalNumberField, optionalText, requiredText } from '@/core/forms/fields';

const commaSeparated = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

// One item per line, for lists a person types into a single field.
export const parseLines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

const linesField = z.string().transform(parseLines);

export const learnerProfileSchema = z.object({
  goals: commaSeparated,
  topics: commaSeparated,
  preferredFormat: z.enum(['reading', 'practical', 'short_summary']),
});

export const FORMAT_OPTIONS = [
  { value: 'reading', label: 'Reading' },
  { value: 'practical', label: 'Practical activities' },
  { value: 'short_summary', label: 'Short summaries' },
];

// FR-F20: every lesson must keep its required structure, including after a reviewer's edit.
export const lessonContentSchema = z.object({
  title: requiredText('Title', 160),
  intro: requiredText('Introduction', 2000),
  example: requiredText('Example', 2000),
  challenge: requiredText('Practical activity', 2000),
});

// FR-F13, FR-F14.
export const contentFormSchema = z
  .object({
    industryCode: z.string(),
    topic: requiredText('Topic', 80),
    difficulty: z.enum(['beginner', 'intermediate', 'advanced']),
    objective: requiredText('Learning objective', 300),
    kpiCode: z.string(),
    title: requiredText('Title', 160),
    intro: requiredText('Introduction', 2000),
    example: requiredText('Example', 2000),
    challenge: requiredText('Practical activity', 2000),
    activities: linesField,
    approvalStatus: z.enum(['draft', 'approved', 'archived']),
  })
  .transform((form) => ({
    ...form,
    industryCode: form.industryCode === '' ? null : form.industryCode,
    kpiCode: form.kpiCode === '' ? null : form.kpiCode,
  }));

export const DIFFICULTY_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
];

export const CONTENT_STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
  { value: 'archived', label: 'Archived' },
];

export const assignEmailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'));

export const completionSchema = z.object({
  answer: optionalText(2000),
  rating: optionalNumberField('Rating', { min: 1 }).refine((value) => value === null || value <= 5, 'Rating must be from 1 to 5.'),
  feedback: optionalText(1000),
});
