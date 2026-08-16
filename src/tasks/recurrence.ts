export const RECURRENCE_INTERVALS = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;

export type RecurrenceInterval = (typeof RECURRENCE_INTERVALS)[number];

export function isRecurrenceInterval(
  value: string | null | undefined,
): value is RecurrenceInterval {
  return RECURRENCE_INTERVALS.some((interval) => interval === value);
}

export function calculateNextRecurringDueDate(
  dueDate: Date,
  interval: RecurrenceInterval,
) {
  const nextDueDate = new Date(dueDate);
  if (interval === 'DAILY') {
    nextDueDate.setUTCDate(nextDueDate.getUTCDate() + 1);
    return nextDueDate;
  }
  if (interval === 'WEEKLY') {
    nextDueDate.setUTCDate(nextDueDate.getUTCDate() + 7);
    return nextDueDate;
  }

  const targetDay = nextDueDate.getUTCDate();
  nextDueDate.setUTCDate(1);
  nextDueDate.setUTCMonth(nextDueDate.getUTCMonth() + 1);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(nextDueDate.getUTCFullYear(), nextDueDate.getUTCMonth() + 1, 0),
  ).getUTCDate();
  nextDueDate.setUTCDate(Math.min(targetDay, lastDayOfTargetMonth));
  return nextDueDate;
}
