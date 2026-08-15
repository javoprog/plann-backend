import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Match } from '../../auth/decorators/match.decorator';

export class ChangePasswordDto {
  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  currentPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @Match('newPassword', { message: 'New passwords do not match' })
  confirmPassword: string;
}
