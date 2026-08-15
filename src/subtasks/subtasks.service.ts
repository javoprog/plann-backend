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
        select: { id: true },
      });
      if (!task) {
        throw new NotFoundException('Task not found');
      }

      await transaction.subtask.create({
        data: { taskId, title: dto.title.trim() },
      });
      return this.taskCompletion.getTaskAggregate(transaction, taskId);
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
        },
      });
      if (!subtask) {
        throw new NotFoundException('Subtask not found');
      }

      const updatedSubtask = await transaction.subtask.update({
        where: { id },
        data: {
          title: dto.title?.trim(),
          isCompleted: dto.isCompleted,
        },
      });
      const updatedTask = await this.taskCompletion.getTaskAggregate(
        transaction,
        subtask.taskId,
      );
      const subtaskXp = getCompletionXp(
        subtask.isCompleted,
        updatedSubtask.isCompleted,
        XP_REWARDS.subtask,
      );
      await this.gamification.applyXpChange(
        transaction,
        userId,
        subtaskXp,
        !subtask.isCompleted && updatedSubtask.isCompleted,
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
        },
      });
      if (!subtask) {
        throw new NotFoundException('Subtask not found');
      }

      await transaction.subtask.delete({ where: { id } });
      const updatedTask = await this.taskCompletion.getTaskAggregate(
        transaction,
        subtask.taskId,
      );
      const removedSubtaskXp = subtask.isCompleted ? -XP_REWARDS.subtask : 0;
      await this.gamification.applyXpChange(
        transaction,
        userId,
        removedSubtaskXp,
        false,
      );
      return updatedTask;
    });
  }
}
