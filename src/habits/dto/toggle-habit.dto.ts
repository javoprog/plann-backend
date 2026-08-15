import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';

export class ToggleHabitDto {
  @ApiProperty({ example: '2026-08-15' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date must use the YYYY-MM-DD format',
  })
  @IsDateString({ strict: true })
  date: string;
}
