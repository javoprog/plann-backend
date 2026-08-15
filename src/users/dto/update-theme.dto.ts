import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export class UpdateThemeDto {
  @ApiProperty({ enum: THEME_PREFERENCES, example: 'system' })
  @IsIn(THEME_PREFERENCES)
  theme: ThemePreference;
}
