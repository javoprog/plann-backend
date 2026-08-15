import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';

@Injectable()
export class SubtasksService {
  constructor(private readonly prisma: PrismaService) {}

  async create(taskId: string, userId: string, dto: CreateSubtaskDto) {
    await this.ensureTaskOwnership(taskId, userId);
    return this.prisma.subtask.create({
      data: { taskId, title: dto.title.trim() },
    });
  }

  async update(id: string, userId: string, dto: UpdateSubtaskDto) {
    await this.ensureSubtaskOwnership(id, userId);
    return this.prisma.subtask.update({
      where: { id },
      data: {
        title: dto.title?.trim(),
        isCompleted: dto.isCompleted,
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.ensureSubtaskOwnership(id, userId);
    await this.prisma.subtask.delete({ where: { id } });
    return { message: 'Subtask deleted' };
  }

  private async ensureTaskOwnership(taskId: string, userId: string) {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, userId },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
  }

  private async ensureSubtaskOwnership(id: string, userId: string) {
    const subtask = await this.prisma.subtask.findFirst({
      where: { id, task: { userId } },
      select: { id: true },
    });
    if (!subtask) {
      throw new NotFoundException('Subtask not found');
    }
  }
}
