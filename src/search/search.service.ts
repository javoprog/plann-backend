import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(userId: string, query: string) {
    const matches = [
      { title: { contains: query } },
      { description: { contains: query } },
    ];

    const [goals, tasks, habits] = await Promise.all([
      this.prisma.goal.findMany({
        where: { userId, OR: matches },
        include: { category: true },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      this.prisma.task.findMany({
        where: { userId, OR: matches },
        include: {
          goal: { include: { category: true } },
          subtasks: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
      this.prisma.habit.findMany({
        where: { userId, OR: matches },
        include: {
          category: true,
          goal: { select: { id: true, title: true } },
        },
        orderBy: { updatedAt: 'desc' },
        take: 6,
      }),
    ]);

    return { goals, tasks, habits };
  }
}
