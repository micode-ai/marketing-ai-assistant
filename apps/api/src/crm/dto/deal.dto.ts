import { IsISO8601, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateDealDto {
  @IsString() title!: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsISO8601() expectedCloseDate?: string;
}

export class UpdateDealDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsNumber() value?: number;
  @IsOptional() @IsString() stageId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsString() contactId?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsISO8601() expectedCloseDate?: string;
}

export class LoseDealDto {
  @IsOptional() @IsString() lostReason?: string;
}
