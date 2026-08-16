import { Injectable, NotFoundException } from '@nestjs/common';
import { GoalStatus } from '@prisma/client';
import {
  GamificationService,
  XP_REWARDS,
} from '../gamification/gamification.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { GoalFiltersDto } from './dto/goal-filters.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

interface GoalProgressTask {
  isCompleted: boolean;
  subtasks: Array<{ isCompleted: boolean }>;
}

export function calculateGoalProgress(tasks: GoalProgressTask[]) {
  const totalTasks = tasks.length;
  const completionValues = tasks.map((task) => {
    if (task.subtasks.length === 0) return task.isCompleted ? 1 : 0;
    const completedSubtasks = task.subtasks.filter(
      (subtask) => subtask.isCompleted,
    ).length;
    return completedSubtasks / task.subtasks.length;
  });
  const completedTasks = completionValues.filter((value) => value === 1).length;
  const progress = totalTasks
    ? Math.round(
        (completionValues.reduce((sum, value) => sum + value, 0) / totalTasks) *
          100,
      )
    : 0;
  return { totalTasks, completedTasks, progress };
}

@Injectable()
export class GoalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gamification: GamificationService,
  ) {}

  async findAll(userId: string, filters: GoalFiltersDto) {
    const goals = await this.prisma.goal.findMany({
      where: {
        userId,
        categoryId: filters.categoryId,
        status: filters.status,
      },
      include: {
        category: true,
        tasks: {
          select: {
            isCompleted: true,
            subtasks: { select: { isCompleted: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return goals.map((goal) => {
      const { tasks, ...data } = goal;
      return { ...data, ...calculateGoalProgress(tasks) };
    });
  }

  async findOne(id: string, userId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id, userId },
      include: {
        category: true,
        tasks: {
          include: { subtasks: { orderBy: { createdAt: 'asc' } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!goal) {
      throw new NotFoundException('Goal not found');
    }

    return { ...goal, ...calculateGoalProgress(goal.tasks) };
  }

  async create(userId: string, dto: CreateGoalDto) {
    if (dto.categoryId) {
      await this.ensureCategoryIsAvailable(dto.categoryId, userId);
    }

    const goal = await this.prisma.goal.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim(),
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        status: dto.status ?? GoalStatus.IN_PROGRESS,
        categoryId: dto.categoryId ?? undefined,
        userId,
      },
      include: { category: true },
    });

    return { ...goal, totalTasks: 0, completedTasks: 0, progress: 0 };
  }

  async update(id: string, userId: string, dto: UpdateGoalDto) {
    await this.ensureGoalOwnership(id, userId);
    if (dto.categoryId) {
      await this.ensureCategoryIsAvailable(dto.categoryId, userId);
    }

    await this.prisma.goal.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        deadline:
          dto.deadline === undefined
            ? undefined
            : dto.deadline === null
              ? null
              : new Date(dto.deadline),
        status: dto.status,
        categoryId: dto.categoryId,
      },
    });

    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const goal = await transaction.goal.findFirst({
        where: { id, userId },
        select: {
          id: true,
          tasks: {
            select: {
              isCompleted: true,
              subtasks: { select: { isCompleted: true } },
            },
          },
        },
      });
      if (!goal) {
        throw new NotFoundException('Goal not found');
      }

      const isCompleted =
        goal.tasks.length > 0 && goal.tasks.every((task) => task.isCompleted);
      const removedTaskXp =
        goal.tasks.filter((task) => task.isCompleted).length * XP_REWARDS.task;
      const removedSubtaskXp =
        goal.tasks.reduce(
          (count, task) =>
            count +
            task.subtasks.filter((subtask) => subtask.isCompleted).length,
          0,
        ) * XP_REWARDS.subtask;
      const removedGoalXp = isCompleted ? XP_REWARDS.goal : 0;

      await transaction.goal.delete({ where: { id } });
      await this.gamification.applyXpChange(
        transaction,
        userId,
        -(removedTaskXp + removedSubtaskXp + removedGoalXp),
        false,
      );
      return { message: 'Goal deleted' };
    });
  }

  private async ensureGoalOwnership(id: string, userId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!goal) {
      throw new NotFoundException('Goal not found');
    }
  }

  private async ensureCategoryIsAvailable(categoryId: string, userId: string) {
    const category = await this.prisma.category.findFirst({
      where: {
        id: categoryId,
        OR: [{ userId: null }, { userId }],
      },
      select: { id: true },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
  }
}
