import {
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export enum ExecutionStatus {
  FILLED = 'FILLED',
  PARTIAL = 'PARTIAL',
  REJECTED = 'REJECTED',
  ERROR = 'ERROR',
}

export class ExecutionReportDto {
  @IsInt()
  @Min(1)
  tradeQueueId!: number;

  @IsEnum(ExecutionStatus)
  status!: ExecutionStatus;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  fillPrice?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  filledQuantity?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  atradOrderRef?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  screenshotPath?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
