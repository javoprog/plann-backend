import type { Prisma } from '@prisma/client';
import { TaskCompletionService } from './task-completion.service';

describe('TaskCompletionService', () => {
  const service = new TaskCompletionService();

  function createTransaction(
    totalSubtasks: number,
    incompleteSubtasks: number,
  ) {
    const count = jest
      .fn()
      .mockResolvedValueOnce(totalSubtasks)
      .mockResolvedValueOnce(incompleteSubtasks);
    const updateMany = jest.fn().mockResolvedValue({ count: totalSubtasks });
    const update = jest.fn().mockResolvedValue({ id: 'task-id' });
    const transaction = {
      subtask: { count, updateMany },
      task: { update },
    } as unknown as Prisma.TransactionClient;

    return { transaction, count, update, updateMany };
  }

  it.each([true, false])(
    'cascades task completion status %s to every subtask',
    async (isCompleted) => {
      const { transaction, updateMany } = createTransaction(2, 0);

      await service.cascadeToSubtasks(transaction, 'task-id', isCompleted);

      expect(updateMany).toHaveBeenCalledWith({
        where: { taskId: 'task-id' },
        data: { isCompleted },
      });
    },
  );

  it('completes the task when every subtask is complete', async () => {
    const { transaction, update } = createTransaction(3, 0);

    await service.recalculateFromSubtasks(transaction, 'task-id');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'task-id' },
      data: { isCompleted: true },
    });
  });

  it('reopens the task when any subtask is incomplete', async () => {
    const { transaction, update } = createTransaction(3, 1);

    await service.recalculateFromSubtasks(transaction, 'task-id');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'task-id' },
      data: { isCompleted: false },
    });
  });

  it('preserves task status when its final subtask is removed', async () => {
    const { transaction, update } = createTransaction(0, 0);

    await service.recalculateFromSubtasks(transaction, 'task-id');

    expect(update).not.toHaveBeenCalled();
  });
});
