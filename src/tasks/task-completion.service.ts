import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export const taskAggregateInclude = {
  goal: { include: { category: true } },
  subtasks: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TaskInclude;

@Injectable()
export class TaskCompletionService {
  cascadeToSubtasks(
    transaction: Prisma.TransactionClient,
    taskId: string,
    isCompleted: boolean,
  ) {
    return transaction.subtask.updateMany({
      where: { taskId },
      data: { isCompleted },
    });
  }

  async recalculateFromSubtasks(
    transaction: Prisma.TransactionClient,
    taskId: string,
  ) {
    const [totalSubtasks, incompleteSubtasks] = await Promise.all([
      transaction.subtask.count({ where: { taskId } }),
      transaction.subtask.count({
        where: { taskId, isCompleted: false },
      }),
    ]);

    if (totalSubtasks === 0) return;

    await transaction.task.update({
      where: { id: taskId },
      data: { isCompleted: incompleteSubtasks === 0 },
    });
  }

  getTaskAggregate(transaction: Prisma.TransactionClient, taskId: string) {
    return transaction.task.findUniqueOrThrow({
      where: { id: taskId },
      include: taskAggregateInclude,
    });
  }
}
