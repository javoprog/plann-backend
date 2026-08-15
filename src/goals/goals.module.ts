import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { GoalsController } from './goals.controller';
import { GoalsService } from './goals.service';

@Module({
  imports: [AiModule],
  controllers: [GoalsController],
  providers: [GoalsService],
})
export class GoalsModule {}
