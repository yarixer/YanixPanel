import { IsOptional, IsString, Matches } from 'class-validator';

export class CreateYanixServerDto {
  @IsString()
  @Matches(/^[A-Z]$/, { message: 'hostLabel must be a single letter A-Z' })
  hostLabel!: string;

  @IsString()
  ip!: string;

  // URL может быть localhost/внутренний IP → IsUrl не используем, чтобы не упереться в require_tld
  @IsString()
  @Matches(/^https?:\/\/\S+$/i, { message: 'apiBaseUrl must start with http:// or https://' })
  apiBaseUrl!: string;

  @IsOptional()
  @IsString()
  @Matches(/^nats:\/\/\S+$/i, { message: 'natsUrl must start with nats://' })
  natsUrl?: string | null;
}

export class UpdateYanixServerDto {
  @IsOptional()
  @IsString()
  ip?: string;

  @IsOptional()
  @IsString()
  @Matches(/^https?:\/\/\S+$/i, { message: 'apiBaseUrl must start with http:// or https://' })
  apiBaseUrl?: string;

  @IsOptional()
  @IsString()
  @Matches(/^nats:\/\/\S+$/i, { message: 'natsUrl must start with nats://' })
  natsUrl?: string | null;
}
