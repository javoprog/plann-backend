import { calculateGoalProgress } from './goals.service';

describe('calculateGoalProgress', () => {
  it('uses task completion when no subtasks exist', () => {
    expect(
      calculateGoalProgress([
        { isCompleted: true, subtasks: [] },
        { isCompleted: false, subtasks: [] },
      ]),
    ).toEqual({ totalTasks: 2, completedTasks: 1, progress: 50 });
  });

  it('weights a task by its completed subtask ratio', () => {
    expect(
      calculateGoalProgress([
        {
          isCompleted: false,
          subtasks: [{ isCompleted: true }, { isCompleted: false }],
        },
        { isCompleted: true, subtasks: [] },
      ]),
    ).toEqual({ totalTasks: 2, completedTasks: 1, progress: 75 });
  });

  it('returns zero progress for an empty goal', () => {
    expect(calculateGoalProgress([])).toEqual({
      totalTasks: 0,
      completedTasks: 0,
      progress: 0,
    });
  });
});
