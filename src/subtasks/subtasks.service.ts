import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TaskCompletionService } from '../tasks/task-completion.service';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';

@Injectable()
export class SubtasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taskCompletion: TaskCompletionService,
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
      await this.taskCompletion.recalculateFromSubtasks(transaction, taskId);
      return this.taskCompletion.getTaskAggregate(transaction, taskId);
    });
  }

  async update(id: string, userId: string, dto: UpdateSubtaskDto) {
    return this.prisma.$transaction(async (transaction) => {
      const subtask = await transaction.subtask.findFirst({
        where: { id, task: { userId } },
        select: { id: true, taskId: true },
      });
      if (!subtask) {
        throw new NotFoundException('Subtask not found');
      }

      await transaction.subtask.update({
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
      return this.taskCompletion.getTaskAggregate(transaction, subtask.taskId);
    });
  }

  async remove(id: string, userId: string) {
    return this.prisma.$transaction(async (transaction) => {
      const subtask = await transaction.subtask.findFirst({
        where: { id, task: { userId } },
        select: { id: true, taskId: true },
      });
      if (!subtask) {
        throw new NotFoundException('Subtask not found');
      }

      await transaction.subtask.delete({ where: { id } });
      await this.taskCompletion.recalculateFromSubtasks(
        transaction,
        subtask.taskId,
      );
      return this.taskCompletion.getTaskAggregate(transaction, subtask.taskId);
    });
  }
}
