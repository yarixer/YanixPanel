import { HttpService } from '@nestjs/axios';
import {
  BadRequestException,
  HttpException,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ContainerInfo,
  RawYanixContainer,
  YanixDockerActionResponse,
  YanixExecResponse,
  YanixDockerRemoveResponse,
} from './types';
import { firstValueFrom } from 'rxjs';

type ExecMode = 'default' | 'args';

interface ExecRequestBody {
  cmd?: string;
  mode?: string;
  login?: boolean; // больше не используется, но оставлен для совместимости с фронтом
}

@Injectable()
export class ServersService implements OnModuleInit {
  private readonly logger = new Logger(ServersService.name);

  // byHost: Map<hostLabel, Map<dockerId, ContainerInfo>>
  private readonly byHost = new Map<string, Map<string, ContainerInfo>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
  ) {}

  async onModuleInit() {
    await this.loadInitialHosts();
    this.startPolling();
  }

  async getYanixServerForHost(hostLabel: string) {
    const server = await this.prisma.yanixServer.findUnique({
      where: { hostLabel },
    });

    if (!server) {
      throw new NotFoundException(
        `Yanix server with hostLabel=${hostLabel} not found`,
      );
    }

    return server;
  }

  private async loadInitialHosts() {
    const servers = await this.prisma.yanixServer.findMany();
    for (const s of servers) {
      if (!this.byHost.has(s.hostLabel)) {
        this.byHost.set(s.hostLabel, new Map());
      }
    }
  }

  private startPolling() {
    setInterval(() => {
      this.pollAllServers().catch((err) => {
        this.logger.error('Failed to poll yanix-api servers', err.stack);
      });
    }, 10_000);
  }

  private async pollAllServers() {
    const servers = await this.prisma.yanixServer.findMany();

    for (const server of servers) {
      const hostLabel = server.hostLabel;
      const baseUrl = server.apiBaseUrl.replace(/\/$/, '');

      const url = `${baseUrl}/api/servers/allinfo`;

      try {
        const { data } = await firstValueFrom(
          this.http.get<RawYanixContainer[] | RawYanixContainer>(url),
        );

        const containers = Array.isArray(data) ? data : [data];

        this.updateHostMap(hostLabel, containers);
      } catch (err: any) {
        this.logger.warn(
          `Failed to fetch ${url} for hostLabel=${hostLabel}: ${err.message}`,
        );
      }
    }
  }

  private updateHostMap(hostLabel: string, containers: RawYanixContainer[]) {
    const newMap = new Map<string, ContainerInfo>();

    for (const c of containers) {
      const info: ContainerInfo = {
        serverId: c.server_id,
        dockerId: c.docker_id,
        exists: c.exists,
        containerState: c.container_state,
        cpuPercent: c.cpu_percent,
        memUsage: c.mem_usage,
        memLimit: c.mem_limit,
        memUsagePercent: c.mem_usage_percent,
        port: c.port,
        hostLabel,
      };
      newMap.set(c.docker_id, info);
    }

    this.byHost.set(hostLabel, newMap);
  }

  getAllContainersSnapshot(): ContainerInfo[] {
    const result: ContainerInfo[] = [];
    for (const [, hostMap] of this.byHost) {
      for (const [, info] of hostMap) {
        result.push(info);
      }
    }
    return result;
  }

  async getContainersForUser(user: { id: bigint; isAdmin: boolean }) {
    if (user.isAdmin) {
      return this.getAllContainersSnapshot();
    }

    const [restricted, access] = await Promise.all([
      this.prisma.restrictedContainer.findMany({
        select: { containerId: true },
      }),
      this.prisma.restrictedContainerAccess.findMany({
        where: { userId: user.id },
        select: { containerId: true },
      }),
    ]);

    const restrictedSet = new Set(restricted.map((r) => r.containerId));
    const allowedSet = new Set(access.map((a) => a.containerId));

    const result: ContainerInfo[] = [];

    for (const [, hostMap] of this.byHost) {
      for (const [, info] of hostMap) {
        const cid = info.dockerId;
        if (!restrictedSet.has(cid)) {
          result.push(info);
          continue;
        }
        if (allowedSet.has(cid)) {
          result.push(info);
        }
      }
    }

    return result;
  }

  async getContainerForUserById(
    user: { id: bigint; isAdmin: boolean } | undefined,
    hostLabel: string,
    dockerId: string,
  ) {
    if (!user) {
      throw new UnauthorizedException('User is not authenticated');
    }

    const hostMap = this.byHost.get(hostLabel);
    if (!hostMap) {
      throw new NotFoundException('Host not found');
    }

    const info = hostMap.get(dockerId);
    if (!info) {
      throw new NotFoundException('Container not found');
    }

    if (user.isAdmin) {
      return info;
    }

    const cid = info.dockerId;

    const [restricted, access] = await Promise.all([
      this.prisma.restrictedContainer.findUnique({
        where: { containerId: cid },
        select: { containerId: true },
      }),
      this.prisma.restrictedContainerAccess.findFirst({
        where: { userId: user.id, containerId: cid },
        select: { containerId: true },
      }),
    ]);

    if (!restricted) {
      return info;
    }

    if (access) {
      return info;
    }

    throw new ForbiddenException('Access to container is restricted');
  }

  private async getYanixServerOrThrow(hostLabel: string) {
    const server = await this.prisma.yanixServer.findUnique({
      where: { hostLabel },
    });
    if (!server) {
      throw new NotFoundException('Yanix server not configured');
    }
    return server;
  }

  private normalizeBaseUrl(url: string): string {
    return url.replace(/\/$/, '');
  }

  private async callDockerAction(
    hostLabel: string,
    dockerId: string,
    action: 'start' | 'stop' | 'restart',
  ): Promise<YanixDockerActionResponse> {
    const yanixServer = await this.getYanixServerOrThrow(hostLabel);
    const base = this.normalizeBaseUrl(yanixServer.apiBaseUrl);
    const url = `${base}/api/servers/id/${dockerId}/${action}`;

    try {
      const { data } = await firstValueFrom(
        this.http.post<YanixDockerActionResponse>(url, {}),
      );
      return data;
    } catch (err: any) {
      const status = err?.response?.status ?? 502;
      const payload = err?.response?.data ?? {
        message: 'Yanix API error',
      };
      throw new HttpException(payload, status);
    }
  }

  private async callDockerRemove(
    hostLabel: string,
    dockerId: string,
  ): Promise<YanixDockerRemoveResponse> {
    const yanixServer = await this.getYanixServerOrThrow(hostLabel);
    const base = this.normalizeBaseUrl(yanixServer.apiBaseUrl);
    const url = `${base}/api/servers/id/${dockerId}/remove`;

    try {
      const { data } = await firstValueFrom(
        this.http.post<YanixDockerRemoveResponse>(url, {}),
      );
      return data;
    } catch (err: any) {
      const status = err?.response?.status ?? 502;
      const payload = err?.response?.data ?? {
        message: 'Yanix API error',
      };
      throw new HttpException(payload, status);
    }
  }

  private findHostLabelByDockerId(dockerId: string): string | null {
    for (const [hostLabel, hostMap] of this.byHost.entries()) {
      if (hostMap.has(dockerId)) {
        return hostLabel;
      }
    }
    return null;
  }

  // ====== PATTERNS ======

  private async getPatternForContainer(dockerId: string) {
    const binding =
      await this.prisma.containerCommandPatternBinding.findUnique({
        where: { containerId: dockerId },
        include: { commandPattern: true },
      });

    if (!binding || !binding.commandPattern) {
      return null;
    }

    return binding.commandPattern.pattern;
  }

  private hasShellOperators(line: string): boolean {
    return /[|&;<>()`]/.test(line);
  }

  private tokenizeArgs(line: string, errMsg: string): string[] {
    const trimmed = (line ?? '').trim();
    if (!trimmed) return [];

    if (this.hasShellOperators(trimmed)) {
      throw new Error(errMsg);
    }

    const result: string[] = [];
    let current = '';
    let quote: '"' | "'" | null = null;

    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];

      if (!quote && (ch === '"' || ch === "'")) {
        quote = ch;
        continue;
      }

      if (quote) {
        if (ch === quote) {
          quote = null;
        } else {
          current += ch;
        }
        continue;
      }

      if (/\s/.test(ch)) {
        if (current.length > 0) {
          result.push(current);
          current = '';
        }
        continue;
      }

      current += ch;
    }

    if (quote) {
      throw new Error(`${errMsg}: незакрытая кавычка`);
    }

    if (current.length > 0) {
      result.push(current);
    }

    return result;
  }

  private buildCmdFromPattern(patternJson: unknown, inputLine: string): string[] {
    const line = (inputLine ?? '').trim();
    if (!line) {
      throw new Error('Команда не может быть пустой');
    }

    if (!Array.isArray(patternJson)) {
      throw new Error('Pattern must be a JSON array');
    }

    const result: string[] = [];
    let cachedArgs: string[] | null = null;

    for (const el of patternJson as any[]) {
      if (typeof el === 'string') {
        if (el === '{{INPUT}}') {
          result.push(line);
        } else if (el === '{{INPUT_ARGS}}') {
          if (!cachedArgs) {
            cachedArgs = this.tokenizeArgs(
              line,
              'Паттерн {{INPUT_ARGS}}: недопустимы shell-операторы (|, &&, >, ...).',
            );
          }
          result.push(...cachedArgs);
        } else {
          result.push(el);
        }
      } else if (el === null || el === undefined) {
        continue;
      } else {
        result.push(String(el));
      }
    }

    if (result.length === 0) {
      throw new Error('Паттерн вернул пустую команду');
    }

    return result;
  }

  // ====== публичные методы для start/stop/restart/exec/remove ======

  async startContainer(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
  ) {
    await this.getContainerForUserById(user, hostLabel, dockerId);
    const data = await this.callDockerAction(hostLabel, dockerId, 'start');

    return {
      dockerId: data.docker_id,
      containerState: data.container_state,
      exists: data.exists,
      serverId: data.server_id ?? null,
    };
  }

  async stopContainer(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
  ) {
    await this.getContainerForUserById(user, hostLabel, dockerId);
    const data = await this.callDockerAction(hostLabel, dockerId, 'stop');

    return {
      dockerId: data.docker_id,
      containerState: data.container_state,
      exists: data.exists,
      serverId: data.server_id ?? null,
    };
  }

  async restartContainer(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
  ) {
    await this.getContainerForUserById(user, hostLabel, dockerId);
    const data = await this.callDockerAction(hostLabel, dockerId, 'restart');

    return {
      dockerId: data.docker_id,
      containerState: data.container_state,
      exists: data.exists,
      serverId: data.server_id ?? null,
    };
  }

  async adminRemoveContainerByDockerId(dockerId: string) {
    const trimmed = (dockerId ?? '').trim();
    if (!trimmed) {
      throw new BadRequestException('dockerId is required');
    }

    const hostLabel = this.findHostLabelByDockerId(trimmed);
    if (!hostLabel) {
      throw new NotFoundException('Container not found for given dockerId');
    }

    const data = await this.callDockerRemove(hostLabel, trimmed);

    const hostMap = this.byHost.get(hostLabel);
    if (hostMap) {
      hostMap.delete(trimmed);
    }

    return data;
  }

  async execInContainer(
    user: { id: bigint; isAdmin: boolean },
    hostLabel: string,
    dockerId: string,
    body: ExecRequestBody,
  ) {
    await this.getContainerForUserById(user, hostLabel, dockerId);

    const yanixServer = await this.getYanixServerOrThrow(hostLabel);
    const base = this.normalizeBaseUrl(yanixServer.apiBaseUrl);
    const url = `${base}/api/servers/id/${dockerId}/exec`;

    const rawCommand = (body?.cmd ?? '').trim();
    const requestedModeRaw = String(body?.mode ?? 'default').toLowerCase();
    const requestedMode: ExecMode =
      requestedModeRaw === 'args' ? 'args' : 'default';

    if (!rawCommand) {
      throw new HttpException(
        { message: 'Команда не может быть пустой' },
        400,
      );
    }

    let cmd: string[];

    try {
      if (requestedMode === 'args') {
        cmd = this.tokenizeArgs(
          rawCommand,
          'args режим: недопустимы shell-операторы (|, &&, >, ...).',
        );
      } else {
        const patternJson = await this.getPatternForContainer(dockerId);
        if (patternJson) {
          cmd = this.buildCmdFromPattern(patternJson, rawCommand);
        } else {
          cmd = this.tokenizeArgs(
            rawCommand,
            'По умолчанию используется разбор на argv без shell-операторов (|, &&, >, ...).',
          );
        }
      }
    } catch (e: any) {
      throw new HttpException(
        { message: e?.message ?? 'Невалидная команда' },
        400,
      );
    }

    if (!cmd || cmd.length === 0) {
      throw new HttpException(
        { message: 'Команда не может быть пустой' },
        400,
      );
    }

    try {
      const { data } = await firstValueFrom(
        this.http.post<YanixExecResponse>(url, { cmd }),
      );
      return data;
    } catch (err: any) {
      const status = err?.response?.status ?? 502;
      const payload = err?.response?.data ?? {
        message: 'Yanix API error',
      };
      throw new HttpException(payload, status);
    }
  }
}
