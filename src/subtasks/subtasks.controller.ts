import {
  Body,
  Controller,
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateSubtaskDto } from './dto/create-subtask.dto';
import { UpdateSubtaskDto } from './dto/update-subtask.dto';
import { SubtasksService } from './subtasks.service';

@ApiTags('subtasks')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class SubtasksController {
  constructor(private readonly subtasksService: SubtasksService) {}

  @Post('tasks/:taskId/subtasks')
  create(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSubtaskDto,
  ) {
    return this.subtasksService.create(taskId, user.id, dto);
  }

  @Patch('subtasks/:id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateSubtaskDto,
  ) {
    return this.subtasksService.update(id, user.id, dto);
  }

  @Delete('subtasks/:id')
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.subtasksService.remove(id, user.id);
  }
}
