import { Module } from '@nestjs/common';
import { HabitsModule } from '../habits/habits.module';
import { TasksModule } from '../tasks/tasks.module';
import { TelegramService } from './telegram.service';
import { TelegramUpdate } from './telegram.update';

@Module({
  imports: [TasksModule, HabitsModule],
  providers: [TelegramService, TelegramUpdate],
})
export class TelegramModule {}
