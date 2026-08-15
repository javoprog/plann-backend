import { Injectable, NotFoundException } from '@nestjs/common';
import { Priority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { TaskFiltersDto } from './dto/task-filters.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (dto.goalId) {
      await this.ensureGoalOwnership(dto.goalId, userId);
    }

    return this.prisma.task.create({
      data: {
        title: dto.title.trim(),
        description: dto.description?.trim(),
        isCompleted: dto.isCompleted ?? false,
        priority: dto.priority ?? Priority.MEDIUM,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        goalId: dto.goalId ?? undefined,
        userId,
      },
      include: {
        goal: { include: { category: true } },
        subtasks: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async update(id: string, userId: string, dto: UpdateTaskDto) {
    await this.ensureTaskOwnership(id, userId);
    if (dto.goalId) {
      await this.ensureGoalOwnership(dto.goalId, userId);
    }

    return this.prisma.task.update({
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
      include: {
        goal: { include: { category: true } },
        subtasks: { orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.ensureTaskOwnership(id, userId);
    await this.prisma.task.delete({ where: { id } });
    return { message: 'Task deleted' };
  }

  private async ensureTaskOwnership(id: string, userId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
  }

  private async ensureGoalOwnership(goalId: string, userId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId },
      select: { id: true },
    });
    if (!goal) {
      throw new NotFoundException('Goal not found');
    }
  }
}
