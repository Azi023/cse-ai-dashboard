import {
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

export class OrderStatusUpdateDto {
  @IsString()
  @MaxLength(100)
  atradOrderRef!: string;

  @IsString()
  @MaxLength(50)
  atradStatus!: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  filledQty?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  filledPrice?: number;
}
