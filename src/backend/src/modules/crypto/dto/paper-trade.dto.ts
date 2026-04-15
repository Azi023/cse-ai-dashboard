import { IsString, IsNumber, IsPositive, Matches } from 'class-validator';

export class PaperTradeDto {
  @IsString()
  @Matches(/^[A-Z]+\/USDT$/, {
    message: 'symbol must be in format like BTC/USDT',
  })
  symbol: string;

  @IsNumber()
  @IsPositive()
  amount: number;
}
