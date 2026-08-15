import type { Prisma } from '@prisma/client';
import {
  calculateGlobalStreak,
  calculateLevel,
  GamificationService,
  getCompletionXp,
  getHabitMilestoneBonus,
} from './gamification.service';

describe('gamification helpers', () => {
  it.each([
    [0, 1],
    [99, 1],
    [100, 2],
    [250, 3],
  ])('maps %i XP to level %i', (xp, level) => {
    expect(calculateLevel(xp)).toBe(level);
  });

  it('only awards or revokes XP when completion changes', () => {
    expect(getCompletionXp(false, true, 10)).toBe(10);
    expect(getCompletionXp(true, false, 10)).toBe(-10);
    expect(getCompletionXp(true, true, 10)).toBe(0);
  });

  it('calculates cumulative habit milestone bonuses', () => {
    expect(getHabitMilestoneBonus(2)).toBe(0);
    expect(getHabitMilestoneBonus(3)).toBe(20);
    expect(getHabitMilestoneBonus(7)).toBe(60);
    expect(getHabitMilestoneBonus(365)).toBe(2020);
  });

  it('increments, preserves, or resets the global streak by date', () => {
    expect(calculateGlobalStreak(0, null, '2026-08-15')).toBe(1);
    expect(calculateGlobalStreak(4, '2026-08-15', '2026-08-15')).toBe(4);
    expect(calculateGlobalStreak(4, '2026-08-14', '2026-08-15')).toBe(5);
    expect(calculateGlobalStreak(4, '2026-08-10', '2026-08-15')).toBe(1);
    expect(calculateGlobalStreak(4, '2026-08-15', '2026-08-10')).toBe(4);
  });
});

describe('GamificationService', () => {
  const service = new GamificationService();

  it('awards and revokes goal XP only when 100% completion changes', () => {
    expect(
      service.getGoalTransitionSummary(
        new Map([['goal-id', false]]),
        new Map([['goal-id', true]]),
      ),
    ).toEqual({ xpDelta: 100, hasCompletion: true });
    expect(
      service.getGoalTransitionSummary(
        new Map([['goal-id', true]]),
        new Map([['goal-id', false]]),
      ),
    ).toEqual({ xpDelta: -100, hasCompletion: false });
  });

  it('clamps revoked XP at zero and recalculates the level', async () => {
    const update = jest.fn().mockResolvedValue({});
    const transaction = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          xp: 5,
          globalStreak: 2,
          lastActiveDate: '2026-08-14',
        }),
        update,
      },
    } as unknown as Prisma.TransactionClient;

    await service.applyXpChange(transaction, 'user-id', -10, false);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: { xp: 0, level: 1 },
    });
  });

  it('awards XP and records one daily activity transition', async () => {
    const update = jest.fn().mockResolvedValue({});
    const transaction = {
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          xp: 95,
          globalStreak: 6,
          lastActiveDate: '2026-08-14',
        }),
        update,
      },
    } as unknown as Prisma.TransactionClient;

    await service.applyXpChange(transaction, 'user-id', 10, true, '2026-08-15');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-id' },
      data: {
        xp: 105,
        level: 2,
        globalStreak: 7,
        lastActiveDate: '2026-08-15',
      },
    });
  });
});
