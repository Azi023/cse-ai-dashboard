import {
  IsArray,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class HoldingItemDto {
  @IsString()
  @MaxLength(20)
  symbol!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsNumber()
  @Min(0)
  avgCost!: number;

  @IsNumber()
  @Min(0)
  marketValue!: number;

  @IsNumber()
  unrealizedGain!: number;
}

export class PortfolioSyncDto {
  @IsNumber()
  @Min(0)
  cashBalance!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HoldingItemDto)
  holdings!: HoldingItemDto[];
}
