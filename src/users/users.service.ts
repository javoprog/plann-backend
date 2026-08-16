import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateLanguageDto } from './dto/update-language.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { UpdateTelegramNotificationsDto } from './dto/update-telegram-notifications.dto';
import { publicProfileSelect, withXpProgress } from './user-profile';

const TELEGRAM_LINK_TTL_MS = 15 * 60 * 1000;
const TELEGRAM_LINK_CODE_ATTEMPTS = 5;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async findProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: publicProfileSelect,
    });
    if (!user) throw new NotFoundException('User not found');
    return withXpProgress(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const email = dto.email.trim().toLowerCase();
    const existingUser = await this.prisma.user.findFirst({
      where: { email, id: { not: userId } },
      select: { id: true },
    });
    if (existingUser) {
      throw new ConflictException('An account with this email already exists');
    }

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { name: dto.name.trim(), email },
        select: publicProfileSelect,
      });
      return withXpProgress(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with this email already exists',
        );
      }
      throw error;
    }
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('New passwords do not match');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!(await bcrypt.compare(dto.currentPassword, user.password))) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const password = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password },
    });
    return { message: 'Password updated' };
  }

  async updateTheme(userId: string, dto: UpdateThemeDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { theme: dto.theme },
      select: publicProfileSelect,
    });
    return withXpProgress(user);
  }

  async updateLanguage(userId: string, dto: UpdateLanguageDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { language: dto.language },
      select: publicProfileSelect,
    });
    return withXpProgress(user);
  }

  async createTelegramLinkCode(userId: string) {
    const botUsername = this.config
      .get<string>('TELEGRAM_BOT_USERNAME')
      ?.trim()
      .replace(/^@/, '');
    if (!botUsername) {
      throw new ServiceUnavailableException('Telegram bot is not configured');
    }

    for (let attempt = 0; attempt < TELEGRAM_LINK_CODE_ATTEMPTS; attempt += 1) {
      const code = randomInt(100000, 1000000).toString();
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: {
            telegramLinkCode: code,
            telegramLinkExpiresAt: new Date(Date.now() + TELEGRAM_LINK_TTL_MS),
          },
        });
        return {
          code,
          botUrl: `https://t.me/${botUsername}?start=${code}`,
        };
      } catch (error) {
        const isCodeCollision =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (!isCodeCollision || attempt === TELEGRAM_LINK_CODE_ATTEMPTS - 1) {
          throw error;
        }
      }
    }

    throw new ServiceUnavailableException(
      'Could not create a Telegram link code',
    );
  }

  async updateTelegramNotifications(
    userId: string,
    dto: UpdateTelegramNotificationsDto,
  ) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { telegramNotifications: dto.telegramNotifications },
      select: publicProfileSelect,
    });
    return withXpProgress(user);
  }

  async unlinkTelegram(userId: string) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        telegramChatId: null,
        telegramLinkCode: null,
        telegramLinkExpiresAt: null,
      },
      select: publicProfileSelect,
    });
    return withXpProgress(user);
  }
}
