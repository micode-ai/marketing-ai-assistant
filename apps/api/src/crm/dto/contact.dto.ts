import { IsArray, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';

export class CreateContactDto {
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() companyId?: string;
  @IsOptional() @IsString() ownerId?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() notes?: string;
}

export class UpdateContactDto extends CreateContactDto {
  @IsOptional() @IsIn(['ACTIVE', 'UNSUBSCRIBED', 'ARCHIVED']) status?: string;
}
