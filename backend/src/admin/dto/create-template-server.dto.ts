// src/admin/dto/create-template-server.dto.ts
import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateTemplateServerDto {
  @IsString()
  @IsNotEmpty()
  serverId: string;

  @IsString()
  @IsNotEmpty()
  template: string;

  @IsObject()
  @IsOptional()
  values?: Record<string, string>;
}
