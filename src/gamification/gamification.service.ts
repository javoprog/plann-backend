import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const XP_REWARDS = {
  task: 10,
  subtask: 2,
  habit: 15,
  goal: 100,
} as const;

export const HABIT_STREAK_MILESTONES = [
  { days: 3, bonus: 20 },
  { days: 7, bonus: 40 },
  { days: 14, bonus: 60 },
  { days: 31, bonus: 100 },
  { days: 100, bonus: 150 },
  { days: 150, bonus: 200 },
  { days: 200, bonus: 250 },
  { days: 250, bonus: 300 },
  { days: 300, bonus: 400 },
  { days: 365, bonus: 500 },
] as const;

export function calculateLevel(xp: number) {
  return Math.floor(Math.max(0, xp) / 100) + 1;
}

export function getCompletionXp(
  wasCompleted: boolean,
  isCompleted: boolean,
  reward: number,
) {
  if (wasCompleted === isCompleted) return 0;
  return isCompleted ? reward : -reward;
}

export function getHabitMilestoneBonus(streak: number) {
  return HABIT_STREAK_MILESTONES.reduce(
    (total, milestone) =>
      streak >= milestone.days ? total + milestone.bonus : total,
    0,
  );
}

export function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function calculateGlobalStreak(
  currentStreak: number,
  lastActiveDate: string | null,
  activityDate: string,
) {
  if (lastActiveDate === activityDate) return currentStreak;
  if (!lastActiveDate) return 1;

  const last = new Date(`${lastActiveDate}T00:00:00.000Z`);
  const current = new Date(`${activityDate}T00:00:00.000Z`);
  const daysBetween = Math.round(
    (current.getTime() - last.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (daysBetween <= 0) return currentStreak;
  return daysBetween === 1 ? currentStreak + 1 : 1;
}

export interface GoalTransitionSummary {
  xpDelta: number;
  hasCompletion: boolean;
}

@Injectable()
export class GamificationService {
  async applyXpChange(
    transaction: Prisma.TransactionClient,
    userId: string,
    xpDelta: number,
    recordActivity: boolean,
    activityDate = getDateKey(),
  ) {
    if (xpDelta === 0 && !recordActivity) return;

    const user = await transaction.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        xp: true,
        globalStreak: true,
        lastActiveDate: true,
      },
    });
    const xp = Math.max(0, user.xp + xpDelta);
    const isNewerActivity =
      recordActivity &&
      (!user.lastActiveDate || activityDate > user.lastActiveDate);
    const activity = recordActivity
      ? {
          globalStreak: calculateGlobalStreak(
            user.globalStreak,
            user.lastActiveDate,
            activityDate,
          ),
          lastActiveDate: isNewerActivity ? activityDate : user.lastActiveDate,
        }
      : {};

    await transaction.user.update({
      where: { id: userId },
      data: {
        xp,
        level: calculateLevel(xp),
        ...activity,
      },
    });
  }

  async isGoalComplete(transaction: Prisma.TransactionClient, goalId: string) {
    const [totalTasks, incompleteTasks] = await Promise.all([
      transaction.task.count({ where: { goalId } }),
      transaction.task.count({ where: { goalId, isCompleted: false } }),
    ]);
    return totalTasks > 0 && incompleteTasks === 0;
  }

  async getGoalCompletionStates(
    transaction: Prisma.TransactionClient,
    goalIds: Array<string | null | undefined>,
  ) {
    const uniqueIds = [...new Set(goalIds.filter((id): id is string => !!id))];
    const entries = await Promise.all(
      uniqueIds.map(
        async (goalId) =>
          [goalId, await this.isGoalComplete(transaction, goalId)] as const,
      ),
    );
    return new Map(entries);
  }

  getGoalTransitionSummary(
    before: Map<string, boolean>,
    after: Map<string, boolean>,
  ): GoalTransitionSummary {
    let xpDelta = 0;
    let hasCompletion = false;
    const goalIds = new Set([...before.keys(), ...after.keys()]);
    for (const goalId of goalIds) {
      const wasCompleted = before.get(goalId) ?? false;
      const isCompleted = after.get(goalId) ?? false;
      xpDelta += getCompletionXp(wasCompleted, isCompleted, XP_REWARDS.goal);
      hasCompletion ||= !wasCompleted && isCompleted;
    }
    return { xpDelta, hasCompletion };
  }
}
