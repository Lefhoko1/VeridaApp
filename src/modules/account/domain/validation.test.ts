import { passwordRule, signInSchema, signUpSchema, verifyEmailSchema } from './validation';

describe('password rule (FR-A03)', () => {
  it('accepts a password meeting every requirement', () => {
    expect(passwordRule.safeParse('Verida2026').success).toBe(true);
  });

  it.each([
    ['too short', 'Ab1'],
    ['no uppercase', 'verida2026'],
    ['no lowercase', 'VERIDA2026'],
    ['no number', 'VeridaApp'],
  ])('rejects a password with %s', (_reason, password) => {
    expect(passwordRule.safeParse(password).success).toBe(false);
  });
});

describe('sign up', () => {
  it('normalises the email address', () => {
    const parsed = signUpSchema.parse({ fullName: ' Neo ', email: ' Neo@Example.COM ', password: 'Verida2026' });
    expect(parsed).toEqual({ fullName: 'Neo', email: 'neo@example.com', password: 'Verida2026' });
  });

  it('reports each invalid field', () => {
    const result = signUpSchema.safeParse({ fullName: '', email: 'nope', password: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(['fullName', 'email', 'password']));
    }
  });
});

describe('sign in', () => {
  it('does not apply password strength rules to existing passwords', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: 'old' }).success).toBe(true);
  });
});

describe('verification code', () => {
  it('must be six digits', () => {
    expect(verifyEmailSchema.safeParse({ code: '123456' }).success).toBe(true);
    expect(verifyEmailSchema.safeParse({ code: '12345' }).success).toBe(false);
    expect(verifyEmailSchema.safeParse({ code: 'abcdef' }).success).toBe(false);
  });
});
