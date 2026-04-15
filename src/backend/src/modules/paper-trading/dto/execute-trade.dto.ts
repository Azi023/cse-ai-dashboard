import {
  IsString,
  IsNumber,
  IsIn,
  IsOptional,
  IsPositive,
  Min,
} from 'class-validator';

export class ExecuteTradeDto {
  @IsString()
  symbol: string;

  @IsIn(['BUY', 'SELL'])
  direction: string;

  @IsNumber()
  @IsPositive()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  price?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsIn(['stock', 'crypto'])
  asset_type?: string;
}
