// backend/src/admin/admin.service.ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
  HttpException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CreateTemplateServerDto } from './dto/create-template-server.dto';
import { CreateYanixServerDto, UpdateYanixServerDto } from './dto/yanix-server.dto';

// ---- типы для списка пользователей в админке ----
export interface AdminUserWithSessions {
  id: string;
  email: string;
  isAdmin: boolean;
  verified: boolean;
  registrationIp: string | null;
  createdAt: string;
  sessions: {
    id: string;
    isActive: boolean;
    ip: string;
    userAgent: string | null;
    createdAt: string;
    expiresAt: string;
  }[];
}

// ---- типы для шаблонов ----
export interface YanixTemplateDescriptor {
  name: string;
  file: string;
}

export interface YanixTemplatePlaceholders {
  template: string;
  placeholders: string[];
}

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly http: HttpService,
  ) {}

  // ===================== Пользователи / сессии / верификация =====================

  async getUsersWithSessions(): Promise<AdminUserWithSessions[]> {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        sessions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    return users.map((u) => ({
      id: String(u.id),
      email: u.email,
      isAdmin: u.isAdmin,
      verified: u.verified,
      registrationIp: u.registrationIp ?? null,
      createdAt: u.createdAt.toISOString(),
      sessions: u.sessions.map((s) => ({
        id: String(s.id),
        isActive: s.isActive,
        ip: s.ip,
        userAgent: s.userAgent,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
    }));
  }

  async setUserVerified(userId: bigint, verified: boolean) {
    const exists = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!exists) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { verified },
      select: {
        id: true,
        verified: true,
      },
    });

    return user;
  }

  async setUserIsAdmin(userId: bigint, isAdmin: boolean) {
    const exists = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!exists) {
      throw new NotFoundException('User not found');
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { isAdmin },
      select: {
        id: true,
        isAdmin: true,
      },
    });

    return user;
  }

  async setUserAdminByEmail(email: string, isAdmin: boolean) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { isAdmin },
    });

    return { ok: true };
  }

  async invalidateAllSessionsForUser(userId: bigint) {
    await this.prisma.session.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    return { ok: true };
  }

  // ===================== Restricted containers =====================

  async getRestrictedContainers() {
    const rows = await this.prisma.restrictedContainer.findMany({
      orderBy: { containerId: 'asc' },
    });

    return rows.map((r) => ({
      containerId: r.containerId,
    }));
  }

  async addRestrictedContainer(dockerId: string) {
    if (!dockerId.trim()) {
      throw new BadRequestException('dockerId is required');
    }

    await this.prisma.restrictedContainer.upsert({
      where: { containerId: dockerId },
      update: {},
      create: { containerId: dockerId },
    });

    return { ok: true };
  }

  async removeRestrictedContainer(dockerId: string) {
    await this.prisma.restrictedContainer.deleteMany({
      where: { containerId: dockerId },
    });

    return { ok: true };
  }

  // ===================== Restricted container access (по e-mail) =====================

  async getRestrictedAccess(dockerId?: string) {
    const where = dockerId ? { containerId: dockerId } : {};

    const rows = await this.prisma.restrictedContainerAccess.findMany({
      where,
      include: {
        user: true,
        container: true,
      },
      orderBy: [{ containerId: 'asc' }, { userId: 'asc' }],
    });

    return rows.map((r) => ({
      containerId: r.containerId,
      userId: String(r.userId),
      userEmail: r.user.email,
    }));
  }

  async addRestrictedAccess(email: string, dockerId: string) {
    if (!email.trim() || !dockerId.trim()) {
      throw new BadRequestException('email and dockerId are required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.restrictedContainer.upsert({
      where: { containerId: dockerId },
      update: {},
      create: { containerId: dockerId },
    });

    await this.prisma.restrictedContainerAccess.upsert({
      where: {
        containerId_userId: {
          containerId: dockerId,
          userId: user.id,
        },
      },
      update: {},
      create: {
        containerId: dockerId,
        userId: user.id,
      },
    });

    return { ok: true };
  }

  async addRestrictedAccessByEmail(dockerId: string, email: string) {
    return this.addRestrictedAccess(email, dockerId);
  }

  async removeRestrictedAccess(email: string, dockerId: string) {
    if (!email.trim() || !dockerId.trim()) {
      throw new BadRequestException('email and dockerId are required');
    }

    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.prisma.restrictedContainerAccess.deleteMany({
      where: { containerId: dockerId, userId: user.id },
    });

    return { ok: true };
  }

  // ===================== Yanix hosts & templates =====================

  async listYanixHosts() {
    const rows = await this.prisma.yanixServer.findMany({
      select: {
        hostLabel: true,
        ip: true,
        apiBaseUrl: true,
      },
      orderBy: { hostLabel: 'asc' },
    });

    return rows.map((r) => ({
      hostLabel: r.hostLabel,
      ip: r.ip,
    }));
  }

  private async getYanixServerOrThrow(hostLabel: string) {
    const server = await this.prisma.yanixServer.findUnique({
      where: { hostLabel },
    });
    if (!server) {
      throw new NotFoundException('Yanix server not configured for this host');
    }
    return server;
  }

  private normalizeBaseUrl(url: string): string {
    return url.replace(/\/$/, '');
  }

  async getTemplatesForHost(
    hostLabel: string,
  ): Promise<YanixTemplateDescriptor[]> {
    const server = await this.getYanixServerOrThrow(hostLabel);
    const base = this.normalizeBaseUrl(server.apiBaseUrl);
    const url = `${base}/api/templates`;

    try {
      const { data } = await firstValueFrom(
        this.http.get<YanixTemplateDescriptor[]>(url),
      );
      return data;
    } catch (err: any) {
      const status = err?.response?.status ?? 502;
      const payload =
        err?.response?.data ??
        ({ message: 'Yanix templates API error' } as any);
      throw new HttpException(payload, status);
    }
  }

  async getTemplatePlaceholders(
    hostLabel: string,
    template: string,
  ): Promise<YanixTemplatePlaceholders> {
    const server = await this.getYanixServerOrThrow(hostLabel);
    const base = this.normalizeBaseUrl(server.apiBaseUrl);
    const encodedTemplate = encodeURIComponent(template);
    const url = `${base}/api/templates/${encodedTemplate}/placeholders`;

    try {
      const { data } = await firstValueFrom(
        this.http.get<YanixTemplatePlaceholders>(url),
      );
      return data;
    } catch (err: any) {
      const status = err?.response?.status ?? 502;
      const payload =
        err?.response?.data ??
        ({ message: 'Yanix template placeholders API error' } as any);
      throw new HttpException(payload, status);
    }
  }

  async createServerFromTemplate(
    hostLabel: string,
    dto: CreateTemplateServerDto,
  ) {
    const server = await this.getYanixServerOrThrow(hostLabel);
    const base = this.normalizeBaseUrl(server.apiBaseUrl);
    const url = `${base}/api/servers`;

    const body = {
      server_id: dto.serverId,
      template: dto.template,
      values: dto.values ?? {},
    };

    try {
      const { data } = await firstValueFrom(this.http.post(url, body));
      return data;
    } catch (err: any) {
      const status = err?.response?.status ?? 502;
      const payload =
        err?.response?.data ??
        ({ message: 'Yanix create server API error' } as any);
      throw new HttpException(payload, status);
    }
  }

  // ===================== COMMAND PATTERNS =====================

  async getAllCommandPatterns() {
    const rows = await this.prisma.commandPattern.findMany({
      orderBy: { name: 'asc' },
    });

    return rows.map((r) => ({
      name: r.name,
      pattern: r.pattern,
    }));
  }

  async upsertCommandPattern(name: string, pattern: unknown) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new BadRequestException('name is required');
    }
    if (pattern === undefined || pattern === null) {
      throw new BadRequestException('pattern is required');
    }
    if (!Array.isArray(pattern)) {
      throw new BadRequestException('pattern must be a JSON array');
    }

    const saved = await this.prisma.commandPattern.upsert({
      where: { name: trimmedName },
      update: { pattern },
      create: {
        name: trimmedName,
        pattern,
      },
    });

    return {
      name: saved.name,
      pattern: saved.pattern,
    };
  }

  async deleteCommandPattern(name: string) {
    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new BadRequestException('name is required');
    }

    await this.prisma.commandPattern.deleteMany({
      where: { name: trimmedName },
    });

    return { ok: true };
  }

  // ===================== CONTAINER → PATTERN BINDINGS =====================

  async getAllContainerPatternBindings() {
    const rows = await this.prisma.containerCommandPatternBinding.findMany({
      include: {
        commandPattern: true,
      },
      orderBy: { containerId: 'asc' },
    });

    return rows.map((r) => ({
      containerId: r.containerId,
      patternName: r.patternName,
      pattern: r.commandPattern?.pattern ?? null,
    }));
  }

  async upsertContainerPatternBinding(
    containerId: string,
    patternName: string,
  ) {
    const trimmedId = containerId.trim();
    const trimmedName = patternName.trim();

    if (!trimmedId) {
      throw new BadRequestException('containerId is required');
    }
    if (!trimmedName) {
      throw new BadRequestException('patternName is required');
    }

    const pattern = await this.prisma.commandPattern.findUnique({
      where: { name: trimmedName },
      select: { name: true },
    });

    if (!pattern) {
      throw new NotFoundException('CommandPattern not found');
    }

    const saved = await this.prisma.containerCommandPatternBinding.upsert({
      where: { containerId: trimmedId },
      update: { patternName: trimmedName },
      create: {
        containerId: trimmedId,
        patternName: trimmedName,
      },
    });

    return {
      containerId: saved.containerId,
      patternName: saved.patternName,
    };
  }

  async deleteContainerPatternBinding(containerId: string) {
    const trimmedId = containerId.trim();
    if (!trimmedId) {
      throw new BadRequestException('containerId is required');
    }

    await this.prisma.containerCommandPatternBinding.deleteMany({
      where: { containerId: trimmedId },
    });

    return { ok: true };
  }
  // ===================== YANIX SERVERS (CRUD) =====================

  async listYanixServers() {
    const rows = await this.prisma.yanixServer.findMany({
      orderBy: { hostLabel: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      hostLabel: r.hostLabel,
      ip: r.ip,
      apiBaseUrl: r.apiBaseUrl,
      natsUrl: r.natsUrl ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async createYanixServer(dto: CreateYanixServerDto) {
    const hostLabel = dto.hostLabel.trim().toUpperCase();
    const ip = dto.ip.trim();
    const apiBaseUrl = dto.apiBaseUrl.trim().replace(/\/$/, '');
    const natsUrl = dto.natsUrl ? dto.natsUrl.trim() : null;

    const created = await this.prisma.yanixServer.create({
      data: { hostLabel, ip, apiBaseUrl, natsUrl },
    });

    return {
      id: created.id,
      hostLabel: created.hostLabel,
      ip: created.ip,
      apiBaseUrl: created.apiBaseUrl,
      natsUrl: created.natsUrl ?? null,
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
    };
  }

  async updateYanixServer(hostLabelRaw: string, dto: UpdateYanixServerDto) {
    const hostLabel = hostLabelRaw.trim().toUpperCase();

    const existing = await this.prisma.yanixServer.findUnique({
      where: { hostLabel },
    });
    if (!existing) {
      throw new NotFoundException('Yanix server not found');
    }

    const data: any = {};
    if (typeof dto.ip === 'string') data.ip = dto.ip.trim();
    if (typeof dto.apiBaseUrl === 'string') data.apiBaseUrl = dto.apiBaseUrl.trim().replace(/\/$/, '');
    if (dto.natsUrl === null) data.natsUrl = null;
    if (typeof dto.natsUrl === 'string') data.natsUrl = dto.natsUrl.trim();

    const updated = await this.prisma.yanixServer.update({
      where: { hostLabel },
      data,
    });

    return {
      id: updated.id,
      hostLabel: updated.hostLabel,
      ip: updated.ip,
      apiBaseUrl: updated.apiBaseUrl,
      natsUrl: updated.natsUrl ?? null,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  async deleteYanixServer(hostLabelRaw: string) {
    const hostLabel = hostLabelRaw.trim().toUpperCase();

    // deleteMany чтобы не падать, если уже нет
    await this.prisma.yanixServer.deleteMany({
      where: { hostLabel },
    });

    return { ok: true };
  }

  
}
