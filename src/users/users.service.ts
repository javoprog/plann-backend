import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { publicProfileSelect, withXpProgress } from './user-profile';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
}
