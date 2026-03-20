import { IsNotEmpty, IsString, IsNumber, IsInt, IsIn, IsOptional, Min, MaxLength } from 'class-validator';

export class CreateDemoTradeDto {
  @IsInt()
  @Min(1)
  demo_account_id: number;

  @IsNotEmpty()
  @IsString()
  @MaxLength(20)
  symbol: string;

  @IsIn(['BUY', 'SELL'])
  direction: 'BUY' | 'SELL';

  @IsInt()
  @Min(1)
  quantity: number;

  @IsOptional()
  @IsIn(['AI_SIGNAL', 'AI_AUTO', 'MANUAL', 'STRATEGY_TEST'])
  source?: string;
}
