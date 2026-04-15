import {
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class RecordSignalDto {
  @IsString()
  @MaxLength(20)
  symbol!: string;

  @IsString()
  @IsIn(['BUY', 'SELL', 'HOLD'])
  direction!: string;

  @IsString()
  @IsIn(['HIGH', 'MEDIUM', 'LOW'])
  confidence!: string;

  @IsNumber()
  @IsPositive()
  price_at_signal!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reasoning?: string;
}
