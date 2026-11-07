import { AppError } from '@/core/errors/AppError';
import { mapProviderError } from '@/core/supabase/mapError';
import type { SupabaseClient } from '@/core/supabase/client';

import type { Session } from '../domain/models';
import type { AuthRepository, Unsubscribe } from '../domain/repositories';

type AuthResponse = { error: { code?: string; message?: string; status?: number } | null };

function assertOk(response: AuthResponse): void {
  if (!response.error) return;
  const { code, message = '' } = response.error;
  if (code === 'invalid_credentials') throw new AppError('unauthenticated', 'That email or password is not correct.');
  if (code === 'email_not_confirmed') throw new AppError('unauthenticated', 'Verify your email address before signing in.');
  if (code === 'user_already_exists' || code === 'email_exists') throw new AppError('conflict', 'An account with this email already exists.');
  if (code === 'weak_password') throw new AppError('validation', 'Choose a stronger password.');
  if (code === 'otp_expired') throw new AppError('validation', 'That code is incorrect or has expired.');
  if (code === 'same_password') throw new AppError('validation', 'Choose a password different from your current one.');
  if (code === 'over_email_send_rate_limit') throw new AppError('conflict', 'Please wait a moment before requesting another email.');
  throw mapProviderError({ ...response.error, message });
}

function toSession(raw: { user: { id: string; email?: string } } | null): Session | null {
  return raw ? { userId: raw.user.id, email: raw.user.email ?? '' } : null;
}

export class SupabaseAuthRepository implements AuthRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getSession(): Promise<Session | null> {
    const response = await this.client.auth.getSession();
    assertOk(response);
    return toSession(response.data.session);
  }

  onSessionChange(listener: (session: Session | null) => void): Unsubscribe {
    const { data } = this.client.auth.onAuthStateChange((_event, session) => listener(toSession(session)));
    return () => data.subscription.unsubscribe();
  }

  async signUp({ fullName, email, password }: { fullName: string; email: string; password: string }): Promise<void> {
    const response = await this.client.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    assertOk(response);
    // With confirmations on, Supabase hides existing accounts by returning a user with no identities.
    if (response.data.user && response.data.user.identities?.length === 0) {
      throw new AppError('conflict', 'An account with this email already exists.');
    }
  }

  async verifySignUp(email: string, code: string): Promise<void> {
    assertOk(await this.client.auth.verifyOtp({ email, token: code, type: 'signup' }));
  }

  async resendVerification(email: string): Promise<void> {
    assertOk(await this.client.auth.resend({ email, type: 'signup' }));
  }

  async signIn(email: string, password: string): Promise<void> {
    assertOk(await this.client.auth.signInWithPassword({ email, password }));
  }

  async signOut(): Promise<void> {
    assertOk(await this.client.auth.signOut());
  }

  async requestPasswordReset(email: string): Promise<void> {
    assertOk(await this.client.auth.resetPasswordForEmail(email));
  }

  async resetPassword({ email, code, newPassword }: { email: string; code: string; newPassword: string }): Promise<void> {
    assertOk(await this.client.auth.verifyOtp({ email, token: code, type: 'recovery' }));
    assertOk(await this.client.auth.updateUser({ password: newPassword }));
  }

  async changePassword(newPassword: string): Promise<void> {
    assertOk(await this.client.auth.updateUser({ password: newPassword }));
  }

  async requestEmailChange(newEmail: string): Promise<void> {
    assertOk(await this.client.auth.updateUser({ email: newEmail }));
  }

  async confirmEmailChange(newEmail: string, code: string): Promise<void> {
    assertOk(await this.client.auth.verifyOtp({ email: newEmail, token: code, type: 'email_change' }));
  }
}
