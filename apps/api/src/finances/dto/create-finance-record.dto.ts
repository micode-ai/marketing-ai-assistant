import { IsString, IsEnum, IsNumber, IsOptional, IsDateString, IsIn, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const SUPPORTED_CURRENCIES = ['USD', 'EUR', 'GBP', 'PLN', 'RUB', 'UAH', 'BYN', 'KZT', 'TRY', 'JPY', 'CNY'];

export class CreateFinanceRecordDto {
  @ApiProperty()
  @IsString()
  projectId: string;

  @ApiProperty()
  @IsString()
  categoryId: string;

  @ApiProperty({ enum: ['INCOME', 'EXPENSE'] })
  @IsEnum(['INCOME', 'EXPENSE'])
  type: 'INCOME' | 'EXPENSE';

  @ApiProperty()
  @IsNumber()
  @Min(0.01)
  amount: number;

  @ApiProperty()
  @IsString()
  @IsIn(SUPPORTED_CURRENCIES)
  currency: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsDateString()
  date: string;
}
