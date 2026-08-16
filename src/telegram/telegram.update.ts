import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Context, Telegraf } from 'telegraf';
import { TelegramService } from './telegram.service';

@Injectable()
export class TelegramUpdate implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramUpdate.name);
  private bot: Telegraf<Context> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly telegramService: TelegramService,
  ) {}

  async onModuleInit() {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN')?.trim();
    if (!token) {
      this.logger.warn(
        'TELEGRAM_BOT_TOKEN is not configured; Telegram polling is disabled',
      );
      return;
    }

    this.bot = new Telegraf<Context>(token);
    this.telegramService.attachBot(this.bot);
    this.bot.start((context) => this.telegramService.handleStart(context));
    this.bot.command('today', (context) =>
      this.telegramService.handleToday(context),
    );
    this.bot.action(/^toggle_(task|habit)_.+$/, (context) =>
      this.telegramService.handleToggle(context),
    );
    this.bot.catch((error) => {
      this.logger.error(
        `Telegram update failed: ${error instanceof Error ? error.stack : String(error)}`,
      );
    });

    await this.bot.launch();
    this.logger.log('Telegram bot polling started');
  }

  onModuleDestroy() {
    this.bot?.stop('Nest application shutdown');
    this.telegramService.detachBot();
  }
}
