import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSubtaskDto {
  @ApiProperty({ example: 'Draft the opening paragraph' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;
}
