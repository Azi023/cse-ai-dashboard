import { IsString, IsNumber, IsPositive, IsIn, Matches } from 'class-validator';

export class CreateDCADto {
  @IsString()
  @Matches(/^[A-Z]+\/USDT$/, { message: 'symbol must be like BTC/USDT' })
  symbol: string;

  @IsNumber()
  @IsPositive()
  amountUsdt: number;

  @IsString()
  @IsIn(['daily', 'weekly', 'biweekly'])
  frequency: string;
}
