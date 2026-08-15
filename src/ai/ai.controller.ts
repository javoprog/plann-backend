import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import { BreakdownGoalDto } from './dto/breakdown-goal.dto';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('breakdown-goal')
  breakdownGoal(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BreakdownGoalDto,
  ) {
    return this.aiService.breakdownGoal(user.id, dto);
  }
}
