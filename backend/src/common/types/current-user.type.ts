import { UserRole } from '@prisma/client';

export type CurrentUserType = {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
};
