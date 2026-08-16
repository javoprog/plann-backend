import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HabitFrequency, Prisma, Priority } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type SupportedLanguage = 'en' | 'ru' | 'uz';

export interface AiGoalPlan {
  tasks: Array<{
    title: string;
    priority: Priority;
    subtasks?: string[];
  }>;
  habits: Array<{ title: string; frequency: HabitFrequency }>;
}

interface GoalPromptData {
  title: string;
  description: string | null;
  deadline: Date | null;
  category: { name: string } | null;
  user: { language: string };
}

const AI_PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    tasks: {
      type: 'array',
      minItems: 5,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          priority: { type: 'string', enum: Object.values(Priority) },
          subtasks: {
            type: 'array',
            minItems: 2,
            maxItems: 4,
            items: { type: 'string' },
          },
        },
        required: ['title', 'priority'],
      },
    },
    habits: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          frequency: { type: 'string', enum: Object.values(HabitFrequency) },
        },
        required: ['title', 'frequency'],
      },
    },
  },
  required: ['tasks', 'habits'],
} as const;

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  en: 'English',
  ru: 'Russian',
  uz: 'Uzbek',
};

const PLACEHOLDER_GOALS = new Set([
  'test',
  'testing',
  'test goal',
  'тест',
  'тестовая цель',
  'sinov',
  'asdf',
  'qwerty',
  'йцукен',
  'фыва',
  'вфывф',
  'lorem ipsum',
]);

function getSupportedLanguage(language: string): SupportedLanguage {
  return language === 'ru' || language === 'uz' ? language : 'en';
}

export function hasInsufficientGoalData(
  title: string,
  description: string | null,
) {
  const combined = `${title} ${description ?? ''}`
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
  if (combined.length < 6 || PLACEHOLDER_GOALS.has(combined)) return true;

  const letters = combined.match(/\p{L}/gu) ?? [];
  if (letters.length < 4) return true;

  if (!combined.includes(' ') && combined.length <= 12) {
    if (/^(.)\1+$/u.test(combined)) return true;
    if (/^(.{2,3}).*\1$/u.test(combined)) return true;
    if (!/[aeiouyаеиоуыэюяёoʻʼ']/iu.test(combined)) return true;
  }

  return false;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePlan(text: string): AiGoalPlan {
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new BadGatewayException('AI provider returned invalid JSON');
  }

  if (
    !isRecord(payload) ||
    !Array.isArray(payload.tasks) ||
    !Array.isArray(payload.habits)
  ) {
    throw new BadGatewayException('AI provider returned an invalid plan');
  }
  if (
    payload.tasks.length < 5 ||
    payload.tasks.length > 8 ||
    payload.habits.length < 3 ||
    payload.habits.length > 5
  ) {
    throw new BadGatewayException('AI provider returned an invalid plan size');
  }

  const tasks = payload.tasks.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.title !== 'string' ||
      !Object.values(Priority).includes(item.priority as Priority)
    ) {
      throw new BadGatewayException('AI provider returned an invalid task');
    }
    const title = item.title.trim();
    if (title.length < 2 || title.length > 200) {
      throw new BadGatewayException(
        'AI provider returned an invalid task title',
      );
    }

    let subtasks: string[] | undefined;
    if (item.subtasks !== undefined) {
      if (
        !Array.isArray(item.subtasks) ||
        item.subtasks.length < 2 ||
        item.subtasks.length > 4
      ) {
        throw new BadGatewayException(
          'AI provider returned invalid task subtasks',
        );
      }
      subtasks = item.subtasks.map((subtask) => {
        if (typeof subtask !== 'string') {
          throw new BadGatewayException(
            'AI provider returned invalid task subtasks',
          );
        }
        const subtaskTitle = subtask.trim();
        if (subtaskTitle.length < 2 || subtaskTitle.length > 200) {
          throw new BadGatewayException(
            'AI provider returned invalid task subtasks',
          );
        }
        return subtaskTitle;
      });
    }

    return {
      title,
      priority: item.priority as Priority,
      ...(subtasks ? { subtasks } : {}),
    };
  });

  const habits = payload.habits.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.title !== 'string' ||
      !Object.values(HabitFrequency).includes(item.frequency as HabitFrequency)
    ) {
      throw new BadGatewayException('AI provider returned an invalid habit');
    }
    const title = item.title.trim();
    if (title.length < 2 || title.length > 200) {
      throw new BadGatewayException(
        'AI provider returned an invalid habit title',
      );
    }
    return { title, frequency: item.frequency as HabitFrequency };
  });

  return { tasks, habits };
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async generateAiPlan(goalId: string, userId: string) {
    const goal = await this.prisma.goal.findFirst({
      where: { id: goalId, userId },
      select: {
        title: true,
        description: true,
        deadline: true,
        category: { select: { name: true } },
        user: { select: { language: true } },
        tasks: { select: { id: true }, take: 1 },
        habits: { select: { id: true }, take: 1 },
      },
    });
    if (!goal) throw new NotFoundException('Goal not found');
    if (goal.tasks.length > 0 || goal.habits.length > 0) {
      throw new BadRequestException(
        'AI plan generation is only available for empty goals',
      );
    }
    if (hasInsufficientGoalData(goal.title, goal.description)) {
      return {
        status: 'INSUFFICIENT_DATA' as const,
        message: 'Insufficient goal details',
      };
    }

    const openAiKey = this.config.get<string>('OPENAI_API_KEY')?.trim();
    const geminiKey = this.config.get<string>('GEMINI_API_KEY')?.trim();
    if (!openAiKey && !geminiKey) {
      throw new ServiceUnavailableException(
        'AI service is temporarily unavailable. Please configure an API key.',
      );
    }

    let plan: AiGoalPlan;
    try {
      plan = openAiKey
        ? await this.generateWithOpenAi(openAiKey, goal)
        : await this.generateWithGemini(geminiKey!, goal);
    } catch {
      throw new ServiceUnavailableException(
        'AI service is temporarily unavailable. Please try again later.',
      );
    }

    return this.prisma.$transaction(
      async (transaction) => {
        const currentGoal = await transaction.goal.findFirst({
          where: { id: goalId, userId },
          select: {
            id: true,
            categoryId: true,
            tasks: { select: { id: true }, take: 1 },
            habits: { select: { id: true }, take: 1 },
          },
        });
        if (!currentGoal) throw new NotFoundException('Goal not found');
        if (currentGoal.tasks.length > 0 || currentGoal.habits.length > 0) {
          throw new BadRequestException(
            'AI plan generation is only available for empty goals',
          );
        }

        const habits = plan.habits.map((habit) => ({
          title: habit.title.trim(),
          frequency: habit.frequency,
          goalId,
          categoryId: currentGoal.categoryId,
          userId,
        }));

        let createdTasksCount = 0;
        for (const taskData of plan.tasks) {
          await transaction.task.create({
            data: {
              title: taskData.title.trim(),
              priority: taskData.priority,
              goalId,
              userId,
              subtasks:
                taskData.subtasks && taskData.subtasks.length > 0
                  ? {
                      create: taskData.subtasks.map((subtaskTitle) => ({
                        title: subtaskTitle.trim(),
                      })),
                    }
                  : undefined,
            },
          });
          createdTasksCount++;
        }
        const habitResult = await transaction.habit.createMany({
          data: habits,
        });

        return {
          status: 'SUCCESS' as const,
          createdTasksCount,
          createdHabitsCount: habitResult.count,
        };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  private buildPrompts(goal: GoalPromptData) {
    const language = getSupportedLanguage(goal.user.language);
    const system = [
      'You are a concise personal-planning assistant.',
      `Respond only in ${LANGUAGE_NAMES[language]}.`,
      'Create 5-8 concrete, independently actionable tasks and 3-5 sustainable habits.',
      'For each task, provide 2-4 step-by-step subtasks.',
      'Use only task priorities LOW, MEDIUM, HIGH and habit frequencies DAILY, WEEKDAYS, WEEKENDS.',
      'Keep every title under 200 characters and avoid duplicate ideas.',
    ].join(' ');
    const user = [
      `Goal: ${goal.title}`,
      `Description: ${goal.description ?? 'Not provided'}`,
      `Category: ${goal.category?.name ?? 'Not provided'}`,
      `Deadline: ${goal.deadline?.toISOString().slice(0, 10) ?? 'Not provided'}`,
    ]
      .filter(Boolean)
      .join('\n');
    return { system, user };
  }

  private async generateWithOpenAi(apiKey: string, goal: GoalPromptData) {
    const prompts = this.buildPrompts(goal);
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.get<string>('OPENAI_MODEL') ?? 'gpt-5.4-nano',
          instructions: prompts.system,
          input: prompts.user,
          text: {
            format: {
              type: 'json_schema',
              name: 'goal_breakdown',
              strict: true,
              schema: AI_PLAN_SCHEMA,
            },
          },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!response.ok) {
        this.logger.error(
          `OpenAI request failed with status ${response.status}`,
        );
        throw new BadGatewayException('OpenAI could not generate a plan');
      }
      const payload = (await response.json()) as unknown;
      const text = this.getOpenAiText(payload);
      if (!text) throw new BadGatewayException('OpenAI returned an empty plan');
      return parsePlan(text);
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.error('OpenAI request failed', error);
      throw new BadGatewayException('OpenAI could not generate a plan');
    }
  }

  private async generateWithGemini(apiKey: string, goal: GoalPromptData) {
    const prompts = this.buildPrompts(goal);
    const model =
      this.config.get<string>('GEMINI_MODEL')?.trim() || 'gemini-2.5-flash';
    const models =
      model === 'gemini-1.5-flash' ? [model, 'gemini-2.0-flash'] : [model];
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: prompts.system }] },
      contents: [{ role: 'user', parts: [{ text: prompts.user }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: AI_PLAN_SCHEMA,
      },
    });
    try {
      for (const currentModel of models) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(currentModel)}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body,
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(
            `Gemini request failed with status ${response.status}: ${errorText}`,
          );
          if (response.status === 404 && currentModel === 'gemini-1.5-flash') {
            continue;
          }
          throw new BadGatewayException(
            `Gemini request failed (${response.status}): ${errorText}`,
          );
        }
        const payload = (await response.json()) as unknown;
        const text = this.getGeminiText(payload);
        if (!text) {
          throw new BadGatewayException('Gemini returned an empty plan');
        }
        return parsePlan(text);
      }
      throw new BadGatewayException('Gemini could not generate a plan');
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.error('Gemini request failed', error);
      throw new BadGatewayException('Gemini could not generate a plan');
    }
  }

  private getOpenAiText(payload: unknown) {
    if (!isRecord(payload)) return null;
    if (typeof payload.output_text === 'string') return payload.output_text;
    if (!Array.isArray(payload.output)) return null;
    for (const output of payload.output) {
      if (!isRecord(output) || !Array.isArray(output.content)) continue;
      for (const content of output.content) {
        if (isRecord(content) && typeof content.text === 'string') {
          return content.text;
        }
      }
    }
    return null;
  }

  private getGeminiText(payload: unknown) {
    if (!isRecord(payload) || !Array.isArray(payload.candidates)) return null;
    const candidates = payload.candidates as unknown[];
    const candidate: unknown = candidates[0];
    if (
      !isRecord(candidate) ||
      !isRecord(candidate.content) ||
      !Array.isArray(candidate.content.parts)
    )
      return null;
    return candidate.content.parts
      .filter((part): part is Record<string, unknown> => isRecord(part))
      .map((part) => part.text)
      .filter((text): text is string => typeof text === 'string')
      .join('');
  }
}
