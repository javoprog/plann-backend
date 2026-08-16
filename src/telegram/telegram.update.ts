import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Telegraf } from 'telegraf';
import { TELEGRAM_MENU, TelegramService } from './telegram.service';

@Injectable()
export class TelegramUpdate implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramUpdate.name);
  private bot: Telegraf<Context> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly telegramService: TelegramService,
  ) {}

  onModuleInit() {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    if (!token) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN is not configured. Skipping Telegram bot polling.',
      );
      return;
    }

    this.bot = new Telegraf<Context>(token);
    this.telegramService.attachBot(this.bot);
    this.bot.start((context) => this.telegramService.handleStart(context));
    this.bot.command('today', (context) =>
      this.telegramService.handleToday(context),
    );
    this.bot.hears(TELEGRAM_MENU.today, (context) =>
      this.telegramService.handleToday(context),
    );
    this.bot.hears(TELEGRAM_MENU.stats, (context) =>
      this.telegramService.handleStats(context),
    );
    this.bot.hears(TELEGRAM_MENU.help, (context) =>
      this.telegramService.handleHelp(context),
    );
    this.bot.action(/^toggle_(task|habit)_.+$/, (context) =>
      this.telegramService.handleToggle(context),
    );
    this.bot.catch((error) => {
      this.logger.error(
        `Telegram update failed: ${error instanceof Error ? error.stack : String(error)}`,
      );
    });

    void this.bot
      .launch()
      .then(() => {
        this.logger.log('Telegram bot polling launched successfully');
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to launch Telegram bot: ${message}`);
      });
  }

  onModuleDestroy() {
    try {
      this.bot?.stop('SIGTERM');
    } catch {
      // Telegraf throws when polling did not start or already stopped.
    } finally {
      this.telegramService.detachBot();
      this.bot = null;
    }
  }
}
