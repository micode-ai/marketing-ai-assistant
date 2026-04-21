import { IsString, IsNotEmpty, Length } from 'class-validator';

export class ConfigureCseDto {
  @IsString()
  @IsNotEmpty()
  @Length(20, 200)
  apiKey!: string;

  @IsString()
  @IsNotEmpty()
  @Length(5, 100)
  cseId!: string;
}
