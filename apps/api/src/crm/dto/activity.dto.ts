import { IsIn, IsISO8601, IsNotEmpty, IsOptional, IsString } from 'class-validator';

const TYPES = ['NOTE', 'CALL', 'EMAIL', 'MEETING'];

export class CreateActivityDto {
  @IsIn(TYPES) type!: string;
  @IsString() @IsNotEmpty() body!: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() dealId?: string;
  @IsOptional() @IsString() companyId?: string;
}

export class UpdateActivityDto {
  @IsOptional() @IsIn(TYPES) type?: string;
  @IsOptional() @IsString() body?: string;
  @IsOptional() @IsISO8601() occurredAt?: string;
}
