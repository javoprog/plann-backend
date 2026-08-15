import { Injectable, NotFoundException } from '@nestjs/common';
import { Priority } from '@prisma/client';
import {
  GamificationService,
  getCompletionXp,
  XP_REWARDS,
} from '../gamification/gamification.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskCompletionService } from './task-completion.service';
import { TaskFiltersDto } from './dto/task-filters.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskCompletion: TaskCompletionService,
    private readonly gamification: GamificationService,
  ) {}

  findAll(userId: string, filters: TaskFiltersDto) {
    const goalId = filters.standalone ? null : filters.goalId;
    return this.prisma.task.findMany({
      where: {
        userId,
        goalId,
        isCompleted: filters.isCompleted,
        priority: filters.priority,
      },
      include: {
        goal: { include: { category: true } },
        subtasks: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: [
        { isCompleted: 'asc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async create(userId: string, dto: CreateTaskDto) {
    return this.prisma.$transaction(async (transaction) => {
      if (dto.goalId) {
        const goal = await transaction.goal.findFirst({
          where: { id: dto.goalId, userId },
          select: { id: true },
        });
        if (!goal) throw new NotFoundException('Goal not found');
      }

      const beforeGoals = await this.gamification.getGoalCompletionStates(
        transaction,
        [dto.goalId],
      );
      const task = await transaction.task.create({
        data: {
          title: dto.title.trim(),
          description: dto.description?.trim(),
          isCompleted: dto.isCompleted ?? false,
          priority: dto.priority ?? Priority.MEDIUM,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          goalId: dto.goalId ?? undefined,
          userId,
        },
      });
      const afterGoals = await this.gamification.getGoalCompletionStates(
        transaction,
        [dto.goalId],
      );
      const goalChange = this.gamification.getGoalTransitionSummary(
        beforeGoals,
        afterGoals,
      );
      const taskXp = task.isCompleted ? XP_REWARDS.task : 0;
      await this.gamification.applyXpChange(
        transaction,
        userId,
        taskXp + goalChange.xpDelta,
        task.isCompleted || goalChange.hasCompletion,
      );
      return this.taskCompletion.getTaskAggregate(transaction, task.id);
    });
  }

  async update(id: string, userId: string, dto: UpdateTaskDto) {
    return this.prisma.$transaction(async (transaction) => {
      const task = await transaction.task.findFirst({
        where: { id, userId },
        select: {
          id: true,
          goalId: true,
          isCompleted: true,
          subtasks: { select: { isCompleted: true } },
        },
      });
      if (!task) {
        throw new NotFoundException('Task not found');
      }

      const nextGoalId = dto.goalId === undefined ? task.goalId : dto.goalId;
      const goalIds = [task.goalId, nextGoalId];
      const beforeGoals = await this.gamification.getGoalCompletionStates(
        transaction,
        goalIds,
      );

      if (dto.goalId) {
        const goal = await transaction.goal.findFirst({
          where: { id: dto.goalId, userId },
          select: { id: true },
        });
        if (!goal) {
          throw new NotFoundException('Goal not found');
        }
      }

      await transaction.task.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          description: dto.description?.trim(),
          isCompleted: dto.isCompleted,
          priority: dto.priority,
          dueDate:
            dto.dueDate === undefined
              ? undefined
              : dto.dueDate === null
                ? null
                : new Date(dto.dueDate),
          goalId: dto.goalId,
        },
      });

      if (dto.isCompleted !== undefined) {
        await this.taskCompletion.cascadeToSubtasks(
          transaction,
          id,
          dto.isCompleted,
        );
      }

      const updatedTask = await this.taskCompletion.getTaskAggregate(
        transaction,
        id,
      );
      let xpDelta = getCompletionXp(
        task.isCompleted,
        updatedTask.isCompleted,
        XP_REWARDS.task,
      );
      let hasCompletion = !task.isCompleted && updatedTask.isCompleted;
      if (dto.isCompleted !== undefined) {
        for (const subtask of task.subtasks) {
          xpDelta += getCompletionXp(
            subtask.isCompleted,
            dto.isCompleted,
            XP_REWARDS.subtask,
          );
          hasCompletion ||= !subtask.isCompleted && dto.isCompleted;
        }
      }
      const afterGoals = await this.gamification.getGoalCompletionStates(
        transaction,
        goalIds,
      );
      const goalChange = this.gamification.getGoalTransitionSummary(
        beforeGoals,
        afterGoals,
      );
      await this.gamification.applyXpChange(
        transaction,
        userId,
        xpDelta + goalChange.xpDelta,
        hasCompletion || goalChange.hasCompletion,
      );

      return updatedTask;
    });
  }

  async remove(id: string, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const task = await transaction.task.findFirst({
        where: { id, userId },
        select: {
          id: true,
          goalId: true,
          isCompleted: true,
          subtasks: { select: { isCompleted: true } },
        },
      });
      if (!task) throw new NotFoundException('Task not found');

      const beforeGoals = await this.gamification.getGoalCompletionStates(
        transaction,
        [task.goalId],
      );
      await transaction.task.delete({ where: { id } });
      const afterGoals = await this.gamification.getGoalCompletionStates(
        transaction,
        [task.goalId],
      );
      const goalChange = this.gamification.getGoalTransitionSummary(
        beforeGoals,
        afterGoals,
      );
      const removedXp =
        (task.isCompleted ? XP_REWARDS.task : 0) +
        task.subtasks.filter((subtask) => subtask.isCompleted).length *
          XP_REWARDS.subtask;
      await this.gamification.applyXpChange(
        transaction,
        userId,
        goalChange.xpDelta - removedXp,
        goalChange.hasCompletion,
      );
      return { message: 'Task deleted' };
    });
  }
}
