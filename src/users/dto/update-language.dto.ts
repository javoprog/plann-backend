import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const LANGUAGES = ['en', 'ru', 'uz'] as const;
export type Language = (typeof LANGUAGES)[number];

export class UpdateLanguageDto {
  @ApiProperty({ enum: LANGUAGES, example: 'en' })
  @IsIn(LANGUAGES)
  language: Language;
}
