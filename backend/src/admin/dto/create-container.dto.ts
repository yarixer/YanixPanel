// src/admin/dto/create-container.dto.ts
export class CreateContainerDto {
  hostLabel: string;
  serverId: string;
  template: string;
  values: Record<string, string>;
}
