import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Matches,
} from 'class-validator';

export class RecordDepositDto {
  /** ISO month string, e.g. "2026-04" */
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'month must be in YYYY-MM format' })
  month!: string;

  @IsNumber()
  @IsPositive()
  depositAmount!: number;

  @IsDateString()
  depositDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
