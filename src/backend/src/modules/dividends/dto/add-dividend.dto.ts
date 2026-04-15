import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class AddDividendDto {
  @IsString()
  @MaxLength(20)
  symbol!: string;

  @IsDateString()
  ex_date!: string;

  @IsNumber()
  @IsPositive()
  amount_per_share!: number;

  @IsOptional()
  @IsDateString()
  payment_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
