import { calculateNextRecurringDueDate } from './recurrence';

describe('calculateNextRecurringDueDate', () => {
  it.each([
    ['DAILY', '2026-08-16T00:00:00.000Z'],
    ['WEEKLY', '2026-08-22T00:00:00.000Z'],
    ['MONTHLY', '2026-09-15T00:00:00.000Z'],
  ] as const)('advances %s recurrence', (interval, expected) => {
    expect(
      calculateNextRecurringDueDate(
        new Date('2026-08-15T00:00:00.000Z'),
        interval,
      ).toISOString(),
    ).toBe(expected);
  });

  it('clamps monthly recurrence to the final day of a shorter month', () => {
    expect(
      calculateNextRecurringDueDate(
        new Date('2026-01-31T00:00:00.000Z'),
        'MONTHLY',
      ).toISOString(),
    ).toBe('2026-02-28T00:00:00.000Z');
  });
});
