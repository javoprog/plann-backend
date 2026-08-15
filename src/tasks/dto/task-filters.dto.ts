import { Priority } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';

const toBoolean = ({ value }: { value: unknown }) => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

export class TaskFiltersDto {
  @IsOptional()
  @IsUUID()
  goalId?: string;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  standalone?: boolean;

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isCompleted?: boolean;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;
}
