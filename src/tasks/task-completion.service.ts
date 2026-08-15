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

  getTaskAggregate(transaction: Prisma.TransactionClient, taskId: string) {
    return transaction.task.findUniqueOrThrow({
      where: { id: taskId },
      include: taskAggregateInclude,
    });
  }
}
