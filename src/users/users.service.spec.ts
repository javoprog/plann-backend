import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

let mockCompareResult = false;
let mockHashResult = 'hashed-new';
const mockCompareCalls: [string, string][] = [];
const mockHashCalls: [string, number][] = [];

jest.mock('bcrypt', () => ({
  compare: (plainText: string, hash: string): Promise<boolean> => {
    mockCompareCalls.push([plainText, hash]);
    return Promise.resolve(mockCompareResult);
  },
  hash: (plainText: string, rounds: number): Promise<string> => {
    mockHashCalls.push([plainText, rounds]);
    return Promise.resolve(mockHashResult);
  },
}));

describe('UsersService', () => {
  const user = {
    id: 'user-id',
    name: 'Alex Morgan',
    email: 'alex@example.com',
    theme: 'system',
    language: 'en',
    xp: 0,
    level: 1,
    globalStreak: 0,
  };
  const mockFindFirst = jest.fn();
  const mockFindUnique = jest.fn();
  const mockUpdate = jest.fn();
  const prisma = {
    user: {
      findFirst: mockFindFirst,
      findUnique: mockFindUnique,
      update: mockUpdate,
    },
  } as unknown as PrismaService;
  const service = new UsersService(prisma);

  beforeEach(() => {
    jest.clearAllMocks();
    mockCompareResult = false;
    mockHashResult = 'hashed-new';
    mockCompareCalls.length = 0;
    mockHashCalls.length = 0;
  });

  it('returns the public user profile including user settings', async () => {
    mockFindUnique.mockResolvedValue(user);

    await expect(service.findProfile(user.id)).resolves.toEqual({
      ...user,
      xpToNextLevel: 100,
    });
  });

  it('rejects an email already owned by another user', async () => {
    mockFindFirst.mockResolvedValue({ id: 'other-user-id' });

    await expect(
      service.updateProfile(user.id, {
        name: 'Alex Morgan',
        email: 'taken@example.com',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('normalizes profile values before saving', async () => {
    mockFindFirst.mockResolvedValue(null);
    mockUpdate.mockResolvedValue(user);

    await service.updateProfile(user.id, {
      name: '  Alex Morgan  ',
      email: '  ALEX@EXAMPLE.COM  ',
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Alex Morgan', email: 'alex@example.com' },
      }),
    );
  });

  it('rejects mismatched new passwords before accessing the database', async () => {
    await expect(
      service.changePassword(user.id, {
        currentPassword: 'current-password',
        newPassword: 'new-password',
        confirmPassword: 'different-password',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it('rejects an incorrect current password', async () => {
    mockFindUnique.mockResolvedValue({
      id: user.id,
      password: 'hashed-current',
    });
    mockCompareResult = false;

    await expect(
      service.changePassword(user.id, {
        currentPassword: 'wrong-password',
        newPassword: 'new-password',
        confirmPassword: 'new-password',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('hashes and stores a valid new password', async () => {
    mockFindUnique.mockResolvedValue({
      id: user.id,
      password: 'hashed-current',
    });
    mockCompareResult = true;
    mockHashResult = 'hashed-new';
    mockUpdate.mockResolvedValue(user);

    await service.changePassword(user.id, {
      currentPassword: 'current-password',
      newPassword: 'new-password',
      confirmPassword: 'new-password',
    });

    expect(mockHashCalls).toContainEqual(['new-password', 12]);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { password: 'hashed-new' },
    });
  });

  it('stores a valid theme and returns the updated public profile', async () => {
    const darkUser = { ...user, theme: 'dark' };
    mockUpdate.mockResolvedValue(darkUser);

    await expect(
      service.updateTheme(user.id, { theme: 'dark' }),
    ).resolves.toEqual({ ...darkUser, xpToNextLevel: 100 });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { theme: 'dark' } }),
    );
  });

  it('stores a valid language and returns the updated public profile', async () => {
    const russianUser = { ...user, language: 'ru' };
    mockUpdate.mockResolvedValue(russianUser);

    await expect(
      service.updateLanguage(user.id, { language: 'ru' }),
    ).resolves.toEqual({ ...russianUser, xpToNextLevel: 100 });
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { language: 'ru' } }),
    );
  });
});
