import { IsOptional, IsString, IsNumber, Min, MaxLength } from 'class-validator';

export class CreateDemoAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  initial_capital?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  strategy?: string;
}
