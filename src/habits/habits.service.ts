import { Injectable, NotFoundException } from '@nestjs/common';
import { HabitFrequency } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHabitDto } from './dto/create-habit.dto';
import { UpdateHabitDto } from './dto/update-habit.dto';

const DATE_PART_LENGTH = 10;

function toDateKey(date: Date) {
  return date.toISOString().slice(0, DATE_PART_LENGTH);
}

function isScheduledDay(date: Date, frequency: HabitFrequency) {
  const weekday = date.getUTCDay();
  if (frequency === HabitFrequency.WEEKDAYS) {
    return weekday >= 1 && weekday <= 5;
  }
  if (frequency === HabitFrequency.WEEKENDS) {
    return weekday === 0 || weekday === 6;
  }
  return true;
}

export function calculateCurrentStreak(
  completedDates: string[],
  frequency: HabitFrequency,
  today = new Date(),
) {
  const completed = new Set(completedDates);
  const cursor = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  let streak = 0;

  for (let checkedDays = 0; checkedDays < 3660; checkedDays += 1) {
    if (!isScheduledDay(cursor, frequency)) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      continue;
    }

    if (!completed.has(toDateKey(cursor))) {
      break;
    }

    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  return streak;
}

@Injectable()
export class HabitsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    const monthPrefix = toDateKey(new Date()).slice(0, 7);
    const habits = await this.prisma.habit.findMany({
      where: { userId },
      include: {
        category: true,
        goal: { select: { id: true, title: true } },
        logs: {
          where: { completed: true },
          orderBy: { date: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return habits.map((habit) => ({
      ...habit,
      currentStreak: calculateCurrentStreak(
        habit.logs.map((log) => log.date),
        habit.frequency,
      ),
      logs: habit.logs.filter((log) => log.date.startsWith(monthPrefix)),
    }));
  }

  async create(userId: string, dto: CreateHabitDto) {
    await this.ensureRelationsAreAvailable(userId, dto.goalId, dto.categoryId);

    const habit = await this.prisma.habit.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim(),
        frequency: dto.frequency ?? HabitFrequency.DAILY,
        goalId: dto.goalId ?? undefined,
        categoryId: dto.categoryId ?? undefined,
        userId,
      },
      include: {
        category: true,
        goal: { select: { id: true, title: true } },
        logs: true,
      },
    });

    return { ...habit, currentStreak: 0 };
  }

  async toggle(id: string, userId: string, date: string) {
    await this.ensureHabitOwnership(id, userId);
    const existing = await this.prisma.habitLog.findUnique({
      where: { habitId_date: { habitId: id, date } },
    });

    if (existing) {
      await this.prisma.habitLog.delete({ where: { id: existing.id } });
      return { habitId: id, date, completed: false };
    }

    return this.prisma.habitLog.create({
      data: { habitId: id, date, completed: true },
    });
  }

  async update(id: string, userId: string, dto: UpdateHabitDto) {
    await this.ensureHabitOwnership(id, userId);
    await this.ensureRelationsAreAvailable(userId, dto.goalId, dto.categoryId);

    return this.prisma.habit.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        frequency: dto.frequency,
        goalId: dto.goalId,
        categoryId: dto.categoryId,
      },
      include: {
        category: true,
        goal: { select: { id: true, title: true } },
        logs: { orderBy: { date: 'asc' } },
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.ensureHabitOwnership(id, userId);
    await this.prisma.habit.delete({ where: { id } });
    return { message: 'Habit deleted' };
  }

  private async ensureHabitOwnership(id: string, userId: string) {
    const habit = await this.prisma.habit.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!habit) {
      throw new NotFoundException('Habit not found');
    }
  }

  private async ensureRelationsAreAvailable(
    userId: string,
    goalId?: string | null,
    categoryId?: string | null,
  ) {
    if (goalId) {
      const goal = await this.prisma.goal.findFirst({
        where: { id: goalId, userId },
        select: { id: true },
      });
      if (!goal) {
        throw new NotFoundException('Goal not found');
      }
    }

    if (categoryId) {
      const category = await this.prisma.category.findFirst({
        where: { id: categoryId, OR: [{ userId: null }, { userId }] },
        select: { id: true },
      });
      if (!category) {
        throw new NotFoundException('Category not found');
      }
    }
  }
}
