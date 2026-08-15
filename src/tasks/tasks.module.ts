import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TaskCompletionService } from './task-completion.service';
import { TasksService } from './tasks.service';

@Module({
  controllers: [TasksController],
  providers: [TasksService, TaskCompletionService],
  exports: [TaskCompletionService],
})
export class TasksModule {}
