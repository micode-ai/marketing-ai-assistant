import { IsOptional, IsString } from 'class-validator';

export class GenerateInsightsDto {
  @IsOptional() @IsString() language?: string;
}
