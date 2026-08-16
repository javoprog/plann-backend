import { Prisma } from '@prisma/client';

export const publicProfileSelect = {
  id: true,
  name: true,
  email: true,
  theme: true,
  language: true,
  xp: true,
  level: true,
  globalStreak: true,
  telegramChatId: true,
  telegramNotifications: true,
} satisfies Prisma.UserSelect;

export type PublicProfile = Prisma.UserGetPayload<{
  select: typeof publicProfileSelect;
}>;

export function withXpProgress(user: PublicProfile) {
  return {
    ...user,
    xpToNextLevel: user.level * 100 - user.xp,
  };
}
