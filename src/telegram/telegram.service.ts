import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Context, Markup, Telegraf } from 'telegraf';
import { isHabitScheduledOnDate } from '../habits/habits.service';
import { HabitsService } from '../habits/habits.service';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';

const DATE_PART_LENGTH = 10;
const CALLBACK_TITLE_LENGTH = 36;

export const TELEGRAM_MENU = {
  today: '📅 План на сегодня',
  stats: '🔥 Мои Стрики и XP',
  help: '❓ Помощь',
} as const;

const TELEGRAM_REPLY_KEYBOARD = Markup.keyboard([
  [
    Markup.button.text(TELEGRAM_MENU.today),
    Markup.button.text(TELEGRAM_MENU.stats),
  ],
  [Markup.button.text(TELEGRAM_MENU.help)],
])
  .resize()
  .persistent();

function toUtcDateKey(date = new Date()) {
  return date.toISOString().slice(0, DATE_PART_LENGTH);
}

function utcDayBounds(date = new Date()) {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function cleanTitle(title: string) {
  return title.replace(/\s+/g, ' ').trim();
}

function compactTitle(title: string) {
  const clean = cleanTitle(title);
  return clean.length > CALLBACK_TITLE_LENGTH
    ? `${clean.slice(0, CALLBACK_TITLE_LENGTH - 1)}…`
    : clean;
}

@Injectable()
export class TelegramService {
  private readonly logger = new Logger(TelegramService.name);
  private bot: Telegraf<Context> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly habitsService: HabitsService,
  ) {}

  attachBot(bot: Telegraf<Context>) {
    this.bot = bot;
  }

  detachBot() {
    this.bot = null;
  }

  async handleStart(context: Context) {
    const chatId = context.chat?.id.toString();
    const text =
      context.message && 'text' in context.message ? context.message.text : '';
    const code = text.match(/^\/start(?:@\w+)?\s+(\d{6})\s*$/)?.[1];
    if (!chatId) return;

    if (!code) {
      const linkedUser = await this.prisma.user.findUnique({
        where: { telegramChatId: chatId },
        select: { name: true },
      });
      if (linkedUser) {
        await context.reply(
          `С возвращением в Plann, ${linkedUser.name}! Выберите действие:`,
          TELEGRAM_REPLY_KEYBOARD,
        );
        return;
      }

      await context.reply(
        'Откройте ссылку из настроек Plann, чтобы привязать Telegram.',
      );
      return;
    }

    const user = await this.prisma.user.findFirst({
      where: {
        telegramLinkCode: code,
        telegramLinkExpiresAt: { gt: new Date() },
      },
      select: { id: true, name: true },
    });
    if (!user) {
      await context.reply(
        'Код привязки недействителен или истёк. Создайте новый код в настройках Plann.',
      );
      return;
    }

    await this.prisma.$transaction([
      this.prisma.user.updateMany({
        where: { telegramChatId: chatId, id: { not: user.id } },
        data: { telegramChatId: null },
      }),
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          telegramChatId: chatId,
          telegramLinkCode: null,
          telegramLinkExpiresAt: null,
        },
      }),
    ]);

    await context.reply(
      `🎉 Ваш Telegram успешно привязан к аккаунту Plann, ${user.name}!`,
      TELEGRAM_REPLY_KEYBOARD,
    );
  }

  async handleToday(context: Context) {
    const linkedUser = await this.findLinkedUser(context);
    if (!linkedUser) return;

    const summary = await this.buildTodaySummary(linkedUser.id);
    await context.reply(summary.text, summary.keyboard);
  }

  async handleStats(context: Context) {
    const linkedUser = await this.findLinkedUser(context);
    if (!linkedUser) return;

    const [user, habits] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: linkedUser.id },
        select: { level: true, xp: true, globalStreak: true },
      }),
      this.habitsService.findAll(linkedUser.id),
    ]);
    if (!user) return;

    const habitLines =
      habits.length > 0
        ? habits.map(
            (habit) =>
              `• ${cleanTitle(habit.title)} — 🔥 ${habit.currentStreak} дн.`,
          )
        : ['— Активных привычек пока нет'];

    await context.reply(
      [
        '🔥 Ваш прогресс в Plann',
        '',
        `Уровень: ${user.level}`,
        `XP: ${user.xp}`,
        `Общая серия активности: ${user.globalStreak} дн.`,
        '',
        'Серии привычек:',
        ...habitLines,
      ].join('\n'),
      TELEGRAM_REPLY_KEYBOARD,
    );
  }

  async handleHelp(context: Context) {
    const linkedUser = await this.findLinkedUser(context);
    if (!linkedUser) return;

    await context.reply(
      [
        '❓ Команды Plann',
        '',
        `${TELEGRAM_MENU.today} — задачи и привычки на сегодня`,
        `${TELEGRAM_MENU.stats} — уровень, XP и текущие серии`,
        `${TELEGRAM_MENU.help} — показать эту справку`,
        '/today — открыть план на сегодня',
      ].join('\n'),
      TELEGRAM_REPLY_KEYBOARD,
    );
  }

  async handleToggle(context: Context) {
    const linkedUser = await this.findLinkedUser(context, true);
    if (!linkedUser) return;

    const callbackData =
      context.callbackQuery && 'data' in context.callbackQuery
        ? context.callbackQuery.data
        : '';
    const match = callbackData.match(/^toggle_(task|habit)_(.+)$/);
    if (!match) {
      await context.answerCbQuery('Неизвестное действие');
      return;
    }

    const [, type, id] = match;
    const today = toUtcDateKey();
    if (type === 'task') {
      const task = await this.tasksService.findOne(id, linkedUser.id);
      if (!task.isCompleted) {
        await this.tasksService.update(id, linkedUser.id, {
          isCompleted: true,
        });
      }
    } else {
      const habit = await this.habitsService.findOne(id, linkedUser.id);
      const isCompletedToday = habit.logs.some(
        (log) => log.completed && log.date === today,
      );
      if (!isCompletedToday) {
        await this.habitsService.toggle(id, linkedUser.id, today);
      }
    }

    const summary = await this.buildTodaySummary(linkedUser.id);
    await context.answerCbQuery('✅ Выполнено!');
    try {
      await context.editMessageText(summary.text, summary.keyboard);
    } catch (error) {
      if (this.isMessageNotModifiedError(error)) return;
      throw error;
    }
  }

  @Cron('0 0 8 * * *', { timeZone: 'UTC' })
  async sendMorningBriefings() {
    if (!this.bot) return;
    const users = await this.findNotificationUsers();
    const results = await Promise.allSettled(
      users.map(async (user) => {
        const summary = await this.buildTodaySummary(user.id);
        return this.bot?.telegram.sendMessage(
          user.telegramChatId,
          `Доброе утро!\n\n${summary.text}`,
          summary.keyboard,
        );
      }),
    );
    this.logRejectedNotifications('morning briefing', results);
  }

  @Cron('0 0 20 * * *', { timeZone: 'UTC' })
  async sendEveningReminders() {
    if (!this.bot) return;
    const users = await this.findNotificationUsers();
    const results = await Promise.allSettled(
      users.map(async (user) => {
        const today = await this.getTodayItems(user.id);
        const incompleteHabits = today.habits.filter(
          (habit) => !habit.isCompleted,
        );
        if (incompleteHabits.length === 0) return;

        const keyboard = Markup.inlineKeyboard(
          incompleteHabits.map((habit) => [
            Markup.button.callback(
              `✅ Отметить: ${compactTitle(habit.title)}`,
              `toggle_habit_${habit.id}`,
            ),
          ]),
        );
        await this.bot?.telegram.sendMessage(
          user.telegramChatId,
          `🌙 Вечернее напоминание\nОсталось привычек: ${incompleteHabits.length}`,
          keyboard,
        );
      }),
    );
    this.logRejectedNotifications('evening reminder', results);
  }

  private async findLinkedUser(context: Context, callback = false) {
    const telegramChatId = context.chat?.id.toString();
    const user = telegramChatId
      ? await this.prisma.user.findUnique({
          where: { telegramChatId },
          select: { id: true },
        })
      : null;
    if (user) return user;

    if (callback) {
      await context.answerCbQuery('Сначала привяжите Telegram в Plann');
    } else {
      await context.reply(
        'Сначала привяжите Telegram в настройках аккаунта Plann.',
      );
    }
    return null;
  }

  private findNotificationUsers() {
    return this.prisma.user.findMany({
      where: {
        telegramNotifications: true,
        telegramChatId: { not: null },
      },
      select: { id: true, telegramChatId: true },
    }) as Promise<Array<{ id: string; telegramChatId: string }>>;
  }

  private async getTodayItems(userId: string) {
    const now = new Date();
    const dateKey = toUtcDateKey(now);
    const { start, end } = utcDayBounds(now);
    const [tasks, habits] = await Promise.all([
      this.prisma.task.findMany({
        where: { userId, dueDate: { gte: start, lt: end } },
        select: { id: true, title: true, isCompleted: true },
        orderBy: [{ isCompleted: 'asc' }, { dueDate: 'asc' }],
      }),
      this.prisma.habit.findMany({
        where: { userId },
        select: {
          id: true,
          title: true,
          frequency: true,
          logs: {
            where: { date: dateKey, completed: true },
            select: { id: true },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    return {
      dateKey,
      tasks,
      habits: habits
        .filter((habit) => isHabitScheduledOnDate(now, habit.frequency))
        .map((habit) => ({
          id: habit.id,
          title: habit.title,
          isCompleted: habit.logs.length > 0,
        })),
    };
  }

  private async buildTodaySummary(userId: string) {
    const today = await this.getTodayItems(userId);
    const taskLines =
      today.tasks.length > 0
        ? today.tasks.map(
            (task) =>
              `${task.isCompleted ? '✅' : '⬜'} ${cleanTitle(task.title)}`,
          )
        : ['— Задач на сегодня нет'];
    const habitLines =
      today.habits.length > 0
        ? today.habits.map(
            (habit) =>
              `${habit.isCompleted ? '✅' : '⬜'} ${cleanTitle(habit.title)}`,
          )
        : ['— Активных привычек нет'];
    const buttons = [
      ...today.tasks.map((task) =>
        Markup.button.callback(
          task.isCompleted
            ? `✅ Выполнено: ${compactTitle(task.title)}`
            : `✅ Отметить: ${compactTitle(task.title)}`,
          `toggle_task_${task.id}`,
        ),
      ),
      ...today.habits.map((habit) =>
        Markup.button.callback(
          habit.isCompleted
            ? `✅ Выполнено: ${compactTitle(habit.title)}`
            : `✅ Отметить: ${compactTitle(habit.title)}`,
          `toggle_habit_${habit.id}`,
        ),
      ),
    ];

    return {
      text: [
        `📅 План на сегодня (${today.dateKey})`,
        '',
        'Задачи:',
        ...taskLines,
        '',
        'Привычки:',
        ...habitLines,
      ].join('\n'),
      keyboard: Markup.inlineKeyboard(buttons.map((button) => [button])),
    };
  }

  private logRejectedNotifications(
    notificationType: string,
    results: PromiseSettledResult<unknown>[],
  ) {
    for (const result of results) {
      if (result.status === 'rejected') {
        this.logger.error(
          `Telegram ${notificationType} failed: ${result.reason instanceof Error ? result.reason.stack : String(result.reason)}`,
        );
      }
    }
  }

  private isMessageNotModifiedError(error: unknown) {
    if (typeof error !== 'object' || error === null) return false;
    const telegramError = error as {
      description?: unknown;
      message?: unknown;
    };
    return [telegramError.description, telegramError.message].some(
      (value) =>
        typeof value === 'string' && value.includes('message is not modified'),
    );
  }
}
