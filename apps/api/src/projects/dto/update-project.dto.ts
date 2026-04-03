import { PartialType } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';
import { IsEnum, IsOptional, IsIn, IsString } from 'class-validator';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @IsOptional()
  @IsEnum(['ACTIVE', 'PAUSED', 'ARCHIVED'])
  status?: string;

  @IsOptional()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @IsIn(['USD', 'EUR', 'GBP', 'PLN', 'RUB', 'UAH', 'BYN', 'KZT', 'TRY', 'JPY', 'CNY'])
  baseCurrency?: string;
}
