import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { HabitFrequency, Priority } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class AiPlanTaskDto {
  @ApiProperty({ example: 'Define the first measurable milestone' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({ enum: Priority })
  @IsEnum(Priority)
  priority: Priority;
}

export class AiPlanHabitDto {
  @ApiProperty({ example: 'Review the next action each morning' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({ enum: HabitFrequency })
  @IsEnum(HabitFrequency)
  frequency: HabitFrequency;
}

export class ApplyAiPlanDto {
  @ApiProperty({ type: [AiPlanTaskDto] })
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => AiPlanTaskDto)
  tasks: AiPlanTaskDto[];

  @ApiProperty({ type: [AiPlanHabitDto] })
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => AiPlanHabitDto)
  habits: AiPlanHabitDto[];
}
