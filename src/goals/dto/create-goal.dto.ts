import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GoalStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateGoalDto {
  @ApiProperty({ example: 'Launch my portfolio' })
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  title: string;

  @ApiPropertyOptional({ example: 'Publish three detailed case studies.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ example: '2026-12-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  deadline?: string | null;

  @ApiPropertyOptional({ enum: GoalStatus, default: GoalStatus.IN_PROGRESS })
  @IsOptional()
  @IsEnum(GoalStatus)
  status?: GoalStatus;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
}
