import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class AddHoldingDto {
  @IsString()
  @MaxLength(20)
  symbol!: string;

  @IsNumber()
  @IsPositive()
  quantity!: number;

  @IsNumber()
  @IsPositive()
  buy_price!: number;

  @IsDateString()
  buy_date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  dividends_received?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  purification_rate?: number;
}
