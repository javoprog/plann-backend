import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateTelegramNotificationsDto {
  @ApiProperty()
  @IsBoolean()
  telegramNotifications!: boolean;
}
