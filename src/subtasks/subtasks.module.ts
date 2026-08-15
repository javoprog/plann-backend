import { Module } from '@nestjs/common';
import { TasksModule } from '../tasks/tasks.module';
import { SubtasksController } from './subtasks.controller';
import { SubtasksService } from './subtasks.service';

@Module({
  imports: [TasksModule],
  controllers: [SubtasksController],
  providers: [SubtasksService],
})
export class SubtasksModule {}
