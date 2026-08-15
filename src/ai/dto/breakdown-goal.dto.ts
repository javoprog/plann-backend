import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class BreakdownGoalDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  goalId: string;

  @ApiPropertyOptional({
    example: 'Focus on a realistic plan I can finish before work.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  additionalContext?: string;
}
