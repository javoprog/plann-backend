import { Injectable, NotFoundException } from '@nestjs/common';
import {
  GamificationService,
  getCompletionXp,
  XP_REWARDS,
} from '../gamification/gamification.service';
import { PrismaService } from '../prisma/prisma.service';
import { TaskCompletionService } from '../tasks/task-completion.service';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';

@Injectable()
export class SubtasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskCompletion: TaskCompletionService,
    private readonly gamification: GamificationService,
  ) {}

  async create(taskId: string, userId: string, dto: CreateSubtaskDto) {
    return this.prisma.$transaction(async (transaction) => {
      const task = await transaction.task.findFirst({
        where: { id: taskId, userId },
        select: { id: true, goalId: true, isCompleted: true },
      });
      if (!task) {
        throw new NotFoundException('Task not found');
      }

      const goalsBefore = await this.gamification.getGoalCompletionStates(
        transaction,
        [task.goalId],
      );
      await transaction.subtask.create({
        data: { taskId, title: dto.title.trim() },
      });
      await this.taskCompletion.recalculateFromSubtasks(transaction, taskId);
      const updatedTask = await this.taskCompletion.getTaskAggregate(
        transaction,
        taskId,
      );
      const goalsAfter = await this.gamification.getGoalCompletionStates(
        transaction,
        [task.goalId],
      );
      const goalTransition = this.gamification.getGoalTransitionSummary(
        goalsBefore,
        goalsAfter,
      );
      const taskXp = getCompletionXp(
        task.isCompleted,
        updatedTask.isCompleted,
        XP_REWARDS.task,
      );
      await this.gamification.applyXpChange(
        transaction,
        userId,
        taskXp + goalTransition.xpDelta,
        (!task.isCompleted && updatedTask.isCompleted) ||
          goalTransition.hasCompletion,
      );
      return updatedTask;
    });
  }

  async update(id: string, userId: string, dto: UpdateSubtaskDto) {
    return this.prisma.$transaction(async (transaction) => {
      const subtask = await transaction.subtask.findFirst({
        where: { id, task: { userId } },
        select: {
          id: true,
          taskId: true,
          isCompleted: true,
          task: { select: { goalId: true, isCompleted: true } },
        },
      });
      if (!subtask) {
        throw new NotFoundException('Subtask not found');
      }

      const goalsBefore = await this.gamification.getGoalCompletionStates(
        transaction,
        [subtask.task.goalId],
      );
      const updatedSubtask = await transaction.subtask.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          isCompleted: dto.isCompleted,
        },
      });
      if (dto.isCompleted !== undefined) {
        await this.taskCompletion.recalculateFromSubtasks(
          transaction,
          subtask.taskId,
        );
      }
      const updatedTask = await this.taskCompletion.getTaskAggregate(
        transaction,
        subtask.taskId,
      );
      const goalsAfter = await this.gamification.getGoalCompletionStates(
        transaction,
        [subtask.task.goalId],
      );
      const goalTransition = this.gamification.getGoalTransitionSummary(
        goalsBefore,
        goalsAfter,
      );
      const subtaskXp = getCompletionXp(
        subtask.isCompleted,
        updatedSubtask.isCompleted,
        XP_REWARDS.subtask,
      );
      const taskXp = getCompletionXp(
        subtask.task.isCompleted,
        updatedTask.isCompleted,
        XP_REWARDS.task,
      );
      await this.gamification.applyXpChange(
        transaction,
        userId,
        subtaskXp + taskXp + goalTransition.xpDelta,
        (!subtask.isCompleted && updatedSubtask.isCompleted) ||
          (!subtask.task.isCompleted && updatedTask.isCompleted) ||
          goalTransition.hasCompletion,
      );
      return updatedTask;
    });
  }

  async remove(id: string, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const subtask = await transaction.subtask.findFirst({
        where: { id, task: { userId } },
        select: {
          id: true,
          taskId: true,
          isCompleted: true,
          task: { select: { goalId: true, isCompleted: true } },
        },
      });
      if (!subtask) {
        throw new NotFoundException('Subtask not found');
      }

      const goalsBefore = await this.gamification.getGoalCompletionStates(
        transaction,
        [subtask.task.goalId],
      );
      await transaction.subtask.delete({ where: { id } });
      await this.taskCompletion.recalculateFromSubtasks(
        transaction,
        subtask.taskId,
      );
      const updatedTask = await this.taskCompletion.getTaskAggregate(
        transaction,
        subtask.taskId,
      );
      const goalsAfter = await this.gamification.getGoalCompletionStates(
        transaction,
        [subtask.task.goalId],
      );
      const goalTransition = this.gamification.getGoalTransitionSummary(
        goalsBefore,
        goalsAfter,
      );
      const removedSubtaskXp = subtask.isCompleted ? -XP_REWARDS.subtask : 0;
      const taskXp = getCompletionXp(
        subtask.task.isCompleted,
        updatedTask.isCompleted,
        XP_REWARDS.task,
      );
      await this.gamification.applyXpChange(
        transaction,
        userId,
        removedSubtaskXp + taskXp + goalTransition.xpDelta,
        (!subtask.task.isCompleted && updatedTask.isCompleted) ||
          goalTransition.hasCompletion,
      );
      return updatedTask;
    });
  }
}
