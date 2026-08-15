import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiService } from './ai.service';

@ApiTags('goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('goals')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post(':id/generate-ai-plan')
  generateAiPlan(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.aiService.generateAiPlan(id, user.id);
  }
}
