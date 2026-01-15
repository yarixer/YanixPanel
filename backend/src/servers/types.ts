// src/servers/types.ts

export interface RawYanixContainer {
  server_id: string;
  docker_id: string;
  exists: boolean;
  container_state: string;
  cpu_percent: number;
  mem_usage: number;
  mem_limit: number;
  mem_usage_percent: number;
  port: string;
}

export interface ContainerInfo {
  serverId: string;
  dockerId: string;
  exists: boolean;
  containerState: string;
  cpuPercent: number;
  memUsage: number;
  memLimit: number;
  memUsagePercent: number;
  port: string;
  hostLabel: string;
}

export interface YanixDockerActionResponse {
  server_id: string;
  docker_id: string;
  exists: boolean;
  container_state: string;
}

export interface YanixExecResponse {
  docker_id: string;
  cmd: string[];
  status: string;
}

export interface YanixDockerRemoveResponse {
  docker_id: string;
  removed: boolean;
}
