import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsBoolean()
  shariah_mode?: boolean;

  @IsOptional()
  @IsString()
  @IsIn(['simple', 'pro'])
  dashboard_mode?: string;

  @IsOptional()
  @IsString()
  @IsIn(['en', 'si', 'ta'])
  language?: string;
}
