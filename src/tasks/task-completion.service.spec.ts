import type { Prisma } from '@prisma/client';
import { TaskCompletionService } from './task-completion.service';

describe('TaskCompletionService', () => {
  const service = new TaskCompletionService();

  function createTransaction() {
    const updateMany = jest.fn().mockResolvedValue({ count: 2 });
    const transaction = {
      subtask: { updateMany },
    } as unknown as Prisma.TransactionClient;

    return { transaction, updateMany };
  }

  it.each([true, false])(
    'cascades task completion status %s to every subtask',
    async (isCompleted) => {
      const { transaction, updateMany } = createTransaction();

      await service.cascadeToSubtasks(transaction, 'task-id', isCompleted);

      expect(updateMany).toHaveBeenCalledWith({
        where: { taskId: 'task-id' },
        data: { isCompleted },
      });
    },
  );

  it('does not expose upward task recalculation from subtasks', () => {
    expect('recalculateFromSubtasks' in service).toBe(false);
  });
});
