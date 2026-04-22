import { IsString, IsNotEmpty, Length } from 'class-validator';

export class ConfigureBraveDto {
  @IsString()
  @IsNotEmpty()
  projectId!: string;

  @IsString()
  @IsNotEmpty()
  @Length(20, 200)
  apiKey!: string;
}
