import { IsOptional, IsString } from 'class-validator';

export class CreateCompanyDto {
  @IsString() name!: string;
  @IsOptional() @IsString() domain?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() ownerId?: string;
}

export class UpdateCompanyDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() domain?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsString() ownerId?: string;
}
