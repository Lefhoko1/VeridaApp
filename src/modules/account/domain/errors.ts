import { AppError } from '@/core/errors/AppError';

// Signing in before entering the emailed code. The app answers by asking for the code, so this is
// told apart from wrong credentials rather than shown as an error.
export class EmailNotVerifiedError extends AppError {
  constructor() {
    super('unauthenticated', 'Verify your email address before signing in.');
    this.name = 'EmailNotVerifiedError';
  }
}
