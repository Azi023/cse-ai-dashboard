import {
  IsArray,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SyncHoldingItemDto {
  @IsString()
  @MaxLength(20)
  symbol!: string;

  @IsString()
  @MaxLength(200)
  companyName!: string;

  @IsNumber()
  @Min(0)
  quantity!: number;

  @IsNumber()
  @Min(0)
  avgPrice!: number;

  @IsNumber()
  @Min(0)
  currentPrice!: number;

  @IsNumber()
  @Min(0)
  marketValue!: number;

  @IsNumber()
  unrealizedPL!: number;

  @IsNumber()
  unrealizedPLPct!: number;
}

export class SyncPushDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncHoldingItemDto)
  holdings!: SyncHoldingItemDto[];

  @IsNumber()
  @Min(0)
  buyingPower!: number;

  @IsNumber()
  @Min(0)
  accountValue!: number;

  @IsNumber()
  @Min(0)
  cashBalance!: number;
}
