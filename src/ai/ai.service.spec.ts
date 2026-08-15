import { HabitFrequency, Priority } from '@prisma/client';
import { buildFallbackPlan } from './ai.service';

describe('buildFallbackPlan', () => {
  const goal = {
    title: 'Run a half marathon',
    description: 'Train consistently without overloading',
    deadline: new Date('2026-12-01T00:00:00.000Z'),
    category: { name: 'Health' },
    user: { language: 'en' },
  };

  it('creates a valid localized plan without an API key', () => {
    const plan = buildFallbackPlan(goal);

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
    expect(plan.tasks.some((task) => task.title.includes(goal.title))).toBe(
      true,
    );
  });

  it('uses the user language and additional context', () => {
    const plan = buildFallbackPlan(
      { ...goal, user: { language: 'ru' } },
      'Тренироваться только по утрам',
    );

    expect(
      plan.tasks.some((task) =>
        task.title.includes('Тренироваться только по утрам'),
      ),
    ).toBe(true);
    expect(plan.habits[0].title).toContain('минут');
  });

  it('keeps every fallback title within the API limit', () => {
    const plan = buildFallbackPlan(goal, 'context '.repeat(100));

    expect(
      [...plan.tasks, ...plan.habits].every((item) => item.title.length <= 200),
    ).toBe(true);
  });
});
