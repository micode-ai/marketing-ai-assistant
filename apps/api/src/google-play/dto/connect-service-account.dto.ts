import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConnectServiceAccountDto {
  @ApiProperty({ description: 'Service account JSON key (stringified)' })
  @IsString()
  @IsNotEmpty()
  serviceAccountKey: string;

  @ApiProperty({ description: 'App package name, e.g. com.example.myapp' })
  @IsString()
  @IsNotEmpty()
  packageName: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  projectId: string;
}
