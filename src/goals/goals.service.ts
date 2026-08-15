import { Injectable, NotFoundException } from '@nestjs/common';
import { GoalStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { GoalFiltersDto } from './dto/goal-filters.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';

@Injectable()
export class GoalsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string, filters: GoalFiltersDto) {
    const goals = await this.prisma.goal.findMany({
      where: {
        userId,
        categoryId: filters.categoryId,
        status: filters.status,
      },
      include: {
        category: true,
        tasks: { select: { isCompleted: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return goals.map((goal) => {
      const { tasks, ...data } = goal;
      return { ...data, ...this.getProgress(tasks) };
    });
  }

  async findOne(id: string, userId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id, userId },
      include: {
        category: true,
        tasks: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!goal) {
      throw new NotFoundException('Goal not found');
    }

    return { ...goal, ...this.getProgress(goal.tasks) };
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
        categoryId: dto.categoryId,
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
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        status: dto.status,
        categoryId: dto.categoryId,
      },
    });

    return this.findOne(id, userId);
  }

  async remove(id: string, userId: string) {
    await this.ensureGoalOwnership(id, userId);
    await this.prisma.goal.delete({ where: { id } });
    return { message: 'Goal deleted' };
  }

  private getProgress(tasks: { isCompleted: boolean }[]) {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((task) => task.isCompleted).length;
    const progress = totalTasks
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;
    return { totalTasks, completedTasks, progress };
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
