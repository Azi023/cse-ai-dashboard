import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateAlertDto {
  @IsString()
  @MaxLength(20)
  symbol!: string;

  @IsString()
  @IsIn(['price_above', 'price_below', 'auto_generated'])
  alert_type!: string;

  @IsString()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  threshold?: number;
}
