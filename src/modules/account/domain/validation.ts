import { z } from 'zod';

import { optionalText, requiredText } from '@/core/forms/fields';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.'));

// FR-A03. Mirrors minimum_password_length and password_requirements in supabase/config.toml.
export const passwordRule = z
  .string()
  .min(8, 'Use at least 8 characters.')
  .regex(/[a-z]/, 'Add a lowercase letter.')
  .regex(/[A-Z]/, 'Add an uppercase letter.')
  .regex(/\d/, 'Add a number.');

const code = z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code from your email.');

export const signUpSchema = z.object({
  fullName: requiredText('Your name'),
  email,
  password: passwordRule,
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
});

export const verifyEmailSchema = z.object({ code });

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z.object({ email, code, newPassword: passwordRule });

export const changePasswordSchema = z.object({ newPassword: passwordRule });

export const changeEmailSchema = z.object({ newEmail: email });

export const profileSchema = z.object({
  fullName: requiredText('Your name'),
  phone: optionalText(32),
});
