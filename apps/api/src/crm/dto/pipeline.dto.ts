import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CreateStageDto {
  @IsString() name!: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
}

export class UpdateStageDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) probability?: number;
  @IsOptional() @IsInt() order?: number;
}
