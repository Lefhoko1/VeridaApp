import type { EntryChoice } from './entryChoice';
import type { Session, UserProfile } from './models';

export type Unsubscribe = () => void;

export interface AuthRepository {
  getSession(): Promise<Session | null>;
  onSessionChange(listener: (session: Session | null) => void): Unsubscribe;
  signUp(input: { fullName: string; email: string; password: string }): Promise<void>;
  verifySignUp(email: string, code: string): Promise<void>;
  resendVerification(email: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  // Verifying the code signs the user in, so the new password is applied in the same step.
  resetPassword(input: { email: string; code: string; newPassword: string }): Promise<void>;
  changePassword(newPassword: string): Promise<void>;
  requestEmailChange(newEmail: string): Promise<void>;
  confirmEmailChange(newEmail: string, code: string): Promise<void>;
}

export interface ProfileRepository {
  getProfile(userId: string): Promise<UserProfile>;
  updateProfile(userId: string, input: { fullName: string; phone: string | null }): Promise<UserProfile>;
  deactivateAccount(): Promise<void>;
  requestAccountDeletion(): Promise<void>;
}

export interface EntryChoiceRepository {
  load(): Promise<EntryChoice | null>;
  save(choice: EntryChoice): Promise<void>;
}
