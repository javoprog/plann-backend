import { HabitFrequency } from '@prisma/client';
import { calculateCurrentStreak } from './habits.service';

describe('calculateCurrentStreak', () => {
  const today = new Date('2026-08-15T12:00:00.000Z');

  it('counts consecutive daily completions ending today', () => {
    expect(
      calculateCurrentStreak(
        ['2026-08-13', '2026-08-14', '2026-08-15'],
        HabitFrequency.DAILY,
        today,
      ),
    ).toBe(3);
  });

  it('skips unscheduled weekend days for weekday habits', () => {
    expect(
      calculateCurrentStreak(
        ['2026-08-13', '2026-08-14'],
        HabitFrequency.WEEKDAYS,
        today,
      ),
    ).toBe(2);
  });

  it('skips unscheduled weekdays for weekend habits', () => {
    expect(
      calculateCurrentStreak(
        ['2026-08-08', '2026-08-09'],
        HabitFrequency.WEEKENDS,
        new Date('2026-08-14T12:00:00.000Z'),
      ),
    ).toBe(2);
  });

  it('stops at the first missing scheduled day', () => {
    expect(
      calculateCurrentStreak(
        ['2026-08-12', '2026-08-14', '2026-08-15'],
        HabitFrequency.DAILY,
        today,
      ),
    ).toBe(2);
  });
});
