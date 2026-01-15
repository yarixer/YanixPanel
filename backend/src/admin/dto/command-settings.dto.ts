// backend/src/admin/dto/command-settings.dto.ts
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class UpsertCommandSettingsDto {
  @IsString()
  containerId!: string;

  @IsString()
  @IsIn(['raw', 'args', 'shell', 'bash'])
  mode!: string;

  @IsBoolean()
  @IsOptional()
  login?: boolean;
}

