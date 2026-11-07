export type Session = {
  userId: string;
  email: string;
};

export type AccountStatus = 'pending_verification' | 'active' | 'suspended' | 'deactivated' | 'deletion_requested';

export type UserProfile = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  accountStatus: AccountStatus;
  createdAt: string;
};
