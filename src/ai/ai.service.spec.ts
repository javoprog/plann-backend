import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { HabitFrequency, Priority } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  AiService,
  buildFallbackPlan,
  hasInsufficientGoalData,
} from './ai.service';

const validGoal = {
  title: 'Run a half marathon',
  description: 'Train consistently without overloading',
  deadline: new Date('2026-12-01T00:00:00.000Z'),
  category: { name: 'Health' },
  user: { language: 'en' },
  tasks: [] as Array<{ id: string }>,
  habits: [] as Array<{ id: string }>,
};

describe('AI plan validation and fallback', () => {
  it.each([
    ['test', null],
    ['вфывф', null],
    ['qwerty', null],
    ['Read', null],
  ])('rejects insufficient goal data: %s', (title, description) => {
    expect(hasInsufficientGoalData(title, description)).toBe(true);
  });

  it.each([
    ['Run 5k', null],
    ['Build portfolio', null],
    ['Learn', 'Practice TypeScript fundamentals'],
  ])('accepts meaningful goal data: %s', (title, description) => {
    expect(hasInsufficientGoalData(title, description)).toBe(false);
  });

  it('creates a valid localized plan without an API key', () => {
    const plan = buildFallbackPlan(validGoal);

    expect(plan.tasks).toHaveLength(5);
    expect(plan.habits).toHaveLength(3);
    expect(
      plan.tasks.every((task) =>
        Object.values(Priority).includes(task.priority),
      ),
    ).toBe(true);
    expect(
      plan.habits.every((habit) =>
        Object.values(HabitFrequency).includes(habit.frequency),
      ),
    ).toBe(true);
  });

  it('uses the user language', () => {
    const plan = buildFallbackPlan({
      ...validGoal,
      user: { language: 'ru' },
    });

    expect(plan.habits[0].title).toContain('минут');
  });

  it('keeps every fallback title within the API limit', () => {
    const plan = buildFallbackPlan({
      ...validGoal,
      title: 'a'.repeat(200),
    });

    expect(
      [...plan.tasks, ...plan.habits].every((item) => item.title.length <= 200),
    ).toBe(true);
  });
});

describe('AiService.generateAiPlan', () => {
  function createService(goal: typeof validGoal) {
    const taskCreateMany = jest.fn(
      (args: {
        data: Array<{
          title: string;
          priority: Priority;
          goalId: string;
          userId: string;
        }>;
      }) => Promise.resolve({ count: args.data.length }),
    );
    const habitCreateMany = jest.fn(
      (args: {
        data: Array<{
          title: string;
          frequency: HabitFrequency;
          goalId: string;
          categoryId: string | null;
          userId: string;
        }>;
      }) => Promise.resolve({ count: args.data.length }),
    );
    const transaction = {
      goal: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'goal-id',
          categoryId: 'category-id',
          tasks: [],
          habits: [],
        }),
      },
      task: { createMany: taskCreateMany },
      habit: { createMany: habitCreateMany },
    };
    const prisma = {
      goal: { findFirst: jest.fn().mockResolvedValue(goal) },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => unknown) =>
          Promise.resolve(callback(transaction)),
      ),
    };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const service = new AiService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );

    return {
      service,
      prisma,
      transaction,
      config,
      taskCreateMany,
      habitCreateMany,
    };
  }

  it('returns insufficient data without calling a generator or transaction', async () => {
    const { service, prisma, config } = createService({
      ...validGoal,
      title: 'test',
      description: null,
    });

    await expect(service.generateAiPlan('goal-id', 'user-id')).resolves.toEqual(
      {
        status: 'INSUFFICIENT_DATA',
        message: 'Insufficient goal details',
      },
    );
    expect(config.get).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects generation when the goal already has content', async () => {
    const { service, prisma } = createService({
      ...validGoal,
      tasks: [{ id: 'existing-task' }],
    });

    await expect(service.generateAiPlan('goal-id', 'user-id')).rejects.toThrow(
      new BadRequestException(
        'AI plan generation is only available for empty goals',
      ),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rechecks goal emptiness inside the serializable transaction', async () => {
    const { service, transaction, taskCreateMany, habitCreateMany } =
      createService(validGoal);
    transaction.goal.findFirst.mockResolvedValue({
      id: 'goal-id',
      categoryId: 'category-id',
      tasks: [{ id: 'manually-added-task' }],
      habits: [],
    });

    await expect(service.generateAiPlan('goal-id', 'user-id')).rejects.toThrow(
      'AI plan generation is only available for empty goals',
    );
    expect(taskCreateMany).not.toHaveBeenCalled();
    expect(habitCreateMany).not.toHaveBeenCalled();
  });

  it('atomically inserts the complete fallback plan', async () => {
    const { service, prisma, taskCreateMany, habitCreateMany } =
      createService(validGoal);

    await expect(service.generateAiPlan('goal-id', 'user-id')).resolves.toEqual(
      {
        status: 'SUCCESS',
        createdTasksCount: 5,
        createdHabitsCount: 3,
      },
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    const taskData = taskCreateMany.mock.calls[0][0].data;
    const habitData = habitCreateMany.mock.calls[0][0].data;
    expect(taskData).toHaveLength(5);
    expect(
      taskData.every(
        (task) => task.goalId === 'goal-id' && task.userId === 'user-id',
      ),
    ).toBe(true);
    expect(habitData).toHaveLength(3);
    expect(
      habitData.every(
        (habit) =>
          habit.goalId === 'goal-id' &&
          habit.userId === 'user-id' &&
          habit.categoryId === 'category-id',
      ),
    ).toBe(true);
  });
});
