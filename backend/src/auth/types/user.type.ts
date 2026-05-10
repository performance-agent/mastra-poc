import { DecodedIdToken } from 'firebase-admin/auth';

export type User = DecodedIdToken & {
  id: string;
};
