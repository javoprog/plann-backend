import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { UpdateTelegramNotificationsDto } from './dto/update-telegram-notifications.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findProfile(user.id);
  }

  @Patch('profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.id, dto);
  }

  @Patch('password')
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changePassword(user.id, dto);
  }

  @Patch('theme')
  updateTheme(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateThemeDto,
  ) {
    return this.usersService.updateTheme(user.id, dto);
  }

  @Patch('language')
  updateLanguage(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateLanguageDto,
  ) {
    return this.usersService.updateLanguage(user.id, dto);
  }

  @Post('telegram-link-code')
  createTelegramLinkCode(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.createTelegramLinkCode(user.id);
  }

  @Patch('telegram-notifications')
  updateTelegramNotifications(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTelegramNotificationsDto,
  ) {
    return this.usersService.updateTelegramNotifications(user.id, dto);
  }

  @Delete('telegram')
  unlinkTelegram(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.unlinkTelegram(user.id);
  }
}
