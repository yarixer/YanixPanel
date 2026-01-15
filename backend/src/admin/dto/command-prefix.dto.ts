// src/admin/dto/command-prefix.dto.ts
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpsertCommandPrefixDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  containerId!: string; // docker_id

  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  prefix!: string; // произвольная строка, несколько слов и т.п.
}
