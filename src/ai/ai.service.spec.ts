import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { HabitFrequency, Priority } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';
import {
  AiService,
  type AiGoalPlan,
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

const generatedPlan: AiGoalPlan = {
  tasks: Array.from({ length: 5 }, (_, index) => ({
    title: `Task ${index + 1}`,
    priority: index < 2 ? Priority.HIGH : Priority.MEDIUM,
    subtasks: [
      `Task ${index + 1} subtask 1`,
      `Task ${index + 1} subtask 2`,
    ],
  })),
  habits: [
    { title: 'Habit 1', frequency: HabitFrequency.DAILY },
    { title: 'Habit 2', frequency: HabitFrequency.WEEKDAYS },
    { title: 'Habit 3', frequency: HabitFrequency.WEEKENDS },
  ],
};

describe('AI plan validation', () => {
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
    ['Learn', 'Practice TypeScript fundamentals'],
  ])('accepts meaningful goal data: %s', (title, description) => {
    expect(hasInsufficientGoalData(title, description)).toBe(false);
  });
});

describe('AiService.generateAiPlan', () => {
  function createService(
    goal: typeof validGoal,
    keys: {
      openAiKey?: string | null;
      geminiKey?: string | null;
    } = {},
  ) {
    const taskCreate = jest.fn().mockResolvedValue({ id: 'task-id' });
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
      task: { create: taskCreate },
      habit: { createMany: habitCreateMany },
    };
    const prisma = {
      goal: { findFirst: jest.fn().mockResolvedValue(goal) },
      $transaction: jest.fn(
        (callback: (client: typeof transaction) => unknown) =>
          Promise.resolve(callback(transaction)),
      ),
    };
    const config = {
      get: jest.fn((key: string) => {
        if (key === 'OPENAI_API_KEY') {
          return keys.openAiKey === undefined
            ? 'test-openai-key'
            : keys.openAiKey;
        }
        if (key === 'GEMINI_API_KEY') return keys.geminiKey ?? undefined;
        return undefined;
      }),
    };
    const service = new AiService(
      prisma as unknown as PrismaService,
      config as unknown as ConfigService,
    );
    type Generator = (
      apiKey: string,
      goalData: unknown,
    ) => Promise<AiGoalPlan>;
    const providerMethods = service as unknown as {
      generateWithOpenAi: Generator;
      generateWithGemini: Generator;
    };
    const openAiGenerator = jest
      .spyOn(providerMethods, 'generateWithOpenAi')
      .mockResolvedValue(generatedPlan);
    const geminiGenerator = jest
      .spyOn(providerMethods, 'generateWithGemini')
      .mockResolvedValue(generatedPlan);

    return {
      service,
      prisma,
      transaction,
      config,
      taskCreate,
      habitCreateMany,
      openAiGenerator,
      geminiGenerator,
    };
  }

  it('enforces finite tasks and recurring habit semantics in the prompt', () => {
    const { service } = createService(validGoal);
    const { system } = (
      service as unknown as {
        buildPrompts(goalData: unknown): { system: string; user: string };
      }
    ).buildPrompts(validGoal);

    expect(system).toContain(
      'Tasks and subtasks MUST be strictly one-time finite actions',
    );
    expect(system).toContain('NEVER generate recurring rules');
    expect(system).toContain('Habits MUST be recurring daily or weekly');
  });

  it('returns insufficient data without calling a generator or transaction', async () => {
    const { service, prisma, config, openAiGenerator, geminiGenerator } =
      createService({
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
    expect(openAiGenerator).not.toHaveBeenCalled();
    expect(geminiGenerator).not.toHaveBeenCalled();
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

  it('returns service unavailable when no provider key is configured', async () => {
    const { service, prisma, openAiGenerator, geminiGenerator } = createService(
      validGoal,
      { openAiKey: null, geminiKey: null },
    );

    await expect(service.generateAiPlan('goal-id', 'user-id')).rejects.toThrow(
      new ServiceUnavailableException(
        'AI service is temporarily unavailable. Please configure an API key.',
      ),
    );
    expect(openAiGenerator).not.toHaveBeenCalled();
    expect(geminiGenerator).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('converts provider failures to service unavailable', async () => {
    const { service, prisma, openAiGenerator } = createService(validGoal);
    openAiGenerator.mockRejectedValue(new Error('provider failed'));

    await expect(service.generateAiPlan('goal-id', 'user-id')).rejects.toThrow(
      new ServiceUnavailableException(
        'AI service is temporarily unavailable. Please try again later.',
      ),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses Gemini when OpenAI is not configured', async () => {
    const { service, openAiGenerator, geminiGenerator } = createService(
      validGoal,
      { openAiKey: null, geminiKey: 'test-gemini-key' },
    );

    await expect(service.generateAiPlan('goal-id', 'user-id')).resolves.toEqual(
      {
        status: 'SUCCESS',
        createdTasksCount: 5,
        createdHabitsCount: 3,
      },
    );
    expect(openAiGenerator).not.toHaveBeenCalled();
    expect(geminiGenerator).toHaveBeenCalledWith(
      'test-gemini-key',
      expect.objectContaining({ title: validGoal.title }),
    );
  });

  it('rechecks goal emptiness inside the serializable transaction', async () => {
    const { service, transaction, taskCreate, habitCreateMany } =
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
    expect(taskCreate).not.toHaveBeenCalled();
    expect(habitCreateMany).not.toHaveBeenCalled();
  });

  it('atomically inserts tasks with nested subtasks and habits', async () => {
    const { service, prisma, taskCreate, habitCreateMany } =
      createService(validGoal);

    await expect(service.generateAiPlan('goal-id', 'user-id')).resolves.toEqual(
      {
        status: 'SUCCESS',
        createdTasksCount: 5,
        createdHabitsCount: 3,
      },
    );
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(taskCreate).toHaveBeenCalledTimes(5);
    expect(taskCreate.mock.calls[0][0]).toEqual({
      data: {
        title: 'Task 1',
        priority: Priority.HIGH,
        goalId: 'goal-id',
        userId: 'user-id',
        subtasks: {
          create: [
            { title: 'Task 1 subtask 1' },
            { title: 'Task 1 subtask 2' },
          ],
        },
      },
    });
    expect(
      taskCreate.mock.calls.every(
        ([args]) =>
          args.data.goalId === 'goal-id' && args.data.userId === 'user-id',
      ),
    ).toBe(true);
    const habitData = habitCreateMany.mock.calls[0][0].data;
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
